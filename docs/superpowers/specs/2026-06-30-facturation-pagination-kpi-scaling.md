# Pagination serveur de /facturation + RPC de comptage des statuts (scaling table `factures` append-only)

Date : 2026-06-30
Statut : **design (non implémenté)**

> Deux chantiers perf liés par la même cause racine : la table `factures` est **append-only** (aucun
> DELETE — exigence légale FR ; annulation = avoir). Elle ne fait donc que grossir. Deux chemins
> chauds chargent aujourd'hui **toute** la table à chaque rendu :
>
> 1. `/facturation` (onglet Factures) — `getFacturesList()` ramène toutes les factures émises + joins.
> 2. Dashboard (pie chart) — `getInvoiceStatusBreakdown()` `SELECT statut` plein-table puis compte en JS.
>
> Les deux sont O(n factures), n croît sans borne. Ce doc conçoit (a) une **pagination serveur keyset**
> pour la liste et (b) un **RPC Postgres de comptage** pour le breakdown. Aucune ligne de code applicatif
> ni de migration n'est appliquée ici.

---

## Invariants légaux à préserver (transverses aux deux chantiers)

Ces propositions sont **purement en lecture** côté factures — elles ne touchent ni à la création, ni à
l'émission, ni à l'annulation. Elles n'altèrent donc structurellement aucun invariant, mais on les liste
pour cadrer les revues :

- **Numérotation gapless** par série/société (`numero_seq`, triggers `generate_facture_ref` /
  `assign_facture_ref_on_send`, `20260524110000_factures_numerotation_par_societe.sql`) — INCHANGÉE.
- **Aucun DELETE** factures/lignes (pas de policy DELETE hors brouillon `a_emettre`,
  `00030_rls_policies.sql:51`) — INCHANGÉE.
- **Montants en NUMERIC(12,2)** (cents entiers côté app) — les counts ne lisent aucun montant.
- **Immuabilité post-émission** (`freeze_facture_after_emission`) — aucune écriture proposée.
- **`projet_id NOT NULL`** (déjà en place, `20260630120500`) — exploité (join `!inner` possible).
- **Logging** : `lib/utils/logger.ts` uniquement, jamais de nouvel envoi Sentry.

---

# CHANTIER 1 — Pagination serveur de la liste des factures

## Problème (preuve code)

`lib/queries/factures.ts:5-34` — `getFacturesList()` :

```ts
const { data, error } = await supabase
  .from('factures')
  .select(
    `id, ref, numero_seq, … projet:projets!…(id, ref),
           client:clients!…!inner(id, trigramme, raison_sociale, is_demo, archive)`,
  )
  .eq('client.archive', false)
  .neq('statut', 'a_emettre') // exclut brouillons
  .order('numero_seq', { ascending: false }); // PAS de .limit / .range
```

Aucune borne : **toutes** les factures émises de l'historique sont chargées, avec deux joins, **à chaque
rendu** de `/facturation` (`app/(dashboard)/facturation/page.tsx:48`, `export const revalidate = 30` →
re-fetch toutes les 30 s + à chaque navigation). Idem `getBrouillons()` (`lib/queries/factures.ts:45-68`)
qui `.order('created_at', { ascending: true })` sans limit.

Le payload entier traverse le réseau jusqu'au client, puis **TanStack Table pagine/filtre/cherche en
mémoire** : `components/facturation/facturation-page-client.tsx:370-378` passe `data={factures}` (tableau
complet) à `<DataTable>`, qui branche `getPaginationRowModel()` + `getFilteredRowModel()` côté navigateur
(`components/shared/data-table/data-table.tsx:164-193`). La pagination affichée (`data-table-pagination.tsx:29`,
`table.getFilteredRowModel().rows.length`) est donc cosmétique : le serveur a déjà tout payé.

Coûts qui croissent linéairement avec l'historique (append-only) :

- **DB** : full scan tri `numero_seq DESC` + 2 nested-loop joins, sans `LIMIT` pour borner le tri.
- **Réseau / sérialisation** : N lignes × (~14 colonnes + projet + client) en JSON.
- **Mémoire client** : tout l'historique hydraté dans le state React + l'export Excel
  (`facturation-page-client.tsx:140-159`, `factures.map(...)` sur le tableau complet).

Le test `__tests__/factures-queries.test.ts:425-436` documente déjà le manque par deux `it.skip`
(« supports a limit/offset pagination signature », « parametric filter by statut »). Ce chantier les active.

## Objectif

Borner le coût d'un rendu de `/facturation` à **une page** (taille fixe, défaut 25), quelle que soit la
taille de l'historique. La recherche, le filtre statut et le filtre par colonne doivent rester
fonctionnels mais s'exécuter **côté serveur** (sinon on retombe sur « charger tout pour filtrer »).

### Invariants UX à préserver

- Tri par défaut **facture la plus récente d'abord** (aujourd'hui `numero_seq DESC`).
- Filtre statut à facettes (`FACTURE_FILTERS`, `facturation-page-client.tsx:53-64`) : émise / payée /
  en retard / avoir.
- Filtres texte par colonne `ref`, `projet`, `client` (`facture-list-columns.tsx:53-107`, `filterFn: textFilterFn`).
- Recherche plein-texte (`searchKey="ref"`, `facturation-page-client.tsx:373`).
- Clic ligne → `/facturation/{ref}` ; aperçu PDF en Sheet (inchangés, hors périmètre).
- Export Excel (doit rester complet, cf. §1.5 — ne peut plus lire le state in-memory).

## Conception

### Décision A — Keyset (seek) plutôt qu'offset (`.range`)

| Critère                               | Offset (`.range(from,to)`)                                  | **Keyset (retenu)**                               |
| ------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| Coût page profonde                    | O(offset) : Postgres scanne+jette toutes les lignes sautées | O(log n) via index, indépendant de la profondeur  |
| Stabilité sous insert concurrent      | page glisse (une émission décale tout)                      | stable : le curseur ancre une valeur, pas un rang |
| Compat « load more » append           | médiocre (doublons/sauts)                                   | naturelle                                         |
| Saut de page arbitraire (aller p. 37) | trivial                                                     | impossible (next/prev/« voir plus » seulement)    |

Une nouvelle facture s'**insère en tête** (`numero_seq` max, tri DESC) : avec offset, chaque émission
pendant la navigation décale les pages → lignes vues deux fois ou ratées. Keyset immunise. Le seul coût :
pas de saut direct à une page N — acceptable ici (consultation chronologique, pas d'accès aléatoire métier).

### Décision B — Clé de tri : tuple `(numero_seq DESC, id DESC)`

`numero_seq` est l'ordre métier (`order('numero_seq', desc)` actuel) mais **n'est pas globalement unique** :
l'unicité est `(societe_emettrice_id, numero_seq)` par série (`20260524110000…:34-40`), et il est **NULL pour
les brouillons** (`a_emettre`, exclus ici de toute façon par `.neq('statut','a_emettre')`). Un keyset sur une
clé non-unique saute/duplique les ex æquo. On ajoute donc `id` (PK `uuid`, `00010_factures.sql:3`) comme
**tie-breaker déterministe**. Tuple d'ordre : `(numero_seq DESC, id DESC)`.

> Mono-société aujourd'hui (SOL) → `numero_seq` y est de fait unique et croissant. Le tie-breaker `id` est la
> garantie de correction quand DIGIVIA/multi-société arrivera (séquences interleavées). Le tri reste
> **global** (comme l'actuel), pas groupé par société — on préserve le comportement observable.

Prédicat keyset « après le curseur (seq*, id*) » en ordre DESC :
`numero_seq < seq*  OR  (numero_seq = seq*  AND  id < id*)`.
PostgREST ne sait pas comparer un tuple → on l'exprime via `.or()` (syntaxe PostgREST, `id` est un uuid donc
comparable lexicographiquement, OK pour un tie-breaker stable) :

```ts
query = query.or(`numero_seq.lt.${seq},and(numero_seq.eq.${seq},id.lt.${id})`);
```

### Décision C — Curseur opaque base64

Le curseur exposé à l'UI est une string opaque `base64url(JSON.stringify({ s: numero_seq, i: id }))`. Avantages :
encapsule le tuple (l'UI ne raisonne pas sur `numero_seq`), insensible aux évolutions futures de la clé,
trivadialement sérialisable dans le state client / une URL. Décodé et **validé** (zod) côté serveur ;
curseur invalide → on repart de la première page (pas d'erreur dure).

### Décision D — Index dédié (cf. migration §1.4)

Index partiel composite `(numero_seq DESC, id DESC) WHERE statut <> 'a_emettre'` : couvre à la fois
le `ORDER BY` et le prédicat keyset, en excluant les brouillons (qui ont `numero_seq IS NULL`). Les index
existants `idx_factures_statut`, `idx_factures_client_id` (`00031_indexes.sql:27-28`,
`20260630130000_restore_hot_indexes.sql:27`) restent utiles pour les filtres ; aucun n'ordonne par
`numero_seq` (`idx_factures_ref` ordonne par `ref` texte, pas par séquence numérique).

### Décision E — Filtres/recherche **côté serveur**

Pour ne pas réintroduire un « charger tout pour filtrer », les filtres deviennent des paramètres de la query :

- **statut** (facettes) → `query.in('statut', statuts)` (toujours borné aux 4 valeurs émises).
- **ref** (recherche + filtre colonne) → `query.ilike('ref', '%'+q+'%')`.
- **projet** (filtre colonne) → `query.ilike('projet.ref', '%'+q+'%')` (embedded, join déjà présent).
- **client** (filtre colonne) → `query.ilike('client.raison_sociale', '%'+q+'%')` (join `!inner`).

> **Choix sur la recherche plein-texte** (impact assumé sur l'existant) : aujourd'hui `searchKey="ref"` +
> `globalFilterFn` stringifie _toutes_ les cellules visibles côté client (`data-table.tsx:73-96`). En keyset
> serveur, on **restreint la recherche omnibox au champ `ref`** (déjà le `searchKey` déclaré), et on
> conserve la recherche projet/client via les **filtres par colonne** (déjà câblés, `facture-list-columns.tsx`).
> C'est le moindre changement fidèle au contrat actuel.
>
> **Alternative documentée (si une vraie omnibox cross-champ est exigée)** : un RPC SQL
> `search_factures_ids(q text)` joignant `factures⋈projets⋈clients` avec `ILIKE`/`pg_trgm` (extension dans le
> schéma `extensions`, `20260511223837…`) renvoyant les `id` matchés, puis `query.in('id', ids)`. Plus
> puissant mais ajoute une surface SQL ; gelé tant que le besoin omnibox cross-champ n'est pas tranché.

### Décision F — Comptage total : exact, page 1 uniquement

L'UI affiche « X-Y sur N résultats » (`data-table-pagination.tsx:36-37`) et le badge `({factures.length})`
de l'onglet (`facturation-page-client.tsx:267-269`). On calcule `count: 'exact', head: true` (pattern
`lib/queries/accueil.ts:62`, `bug-reports.ts:44`) **seulement quand `cursor` est absent** (première page),
avec les **mêmes filtres** que la requête de données. Les pages suivantes ne recomptent pas (le total ne
change pas pendant la navigation au keyset). Aux volumes SOLUVIA, `count exact` reste acceptable ; si la
table devient très grande, basculer en `count: 'planned'` (estimé, plus rapide) est un changement d'un mot —
documenté, non requis aujourd'hui.

### Décision G — Détection « page suivante »

On demande `limit + 1` lignes. Si on en reçoit `limit + 1`, il y a une page suivante : on tronque à `limit`
et on calcule `nextCursor` depuis la **dernière ligne conservée**. Sinon `nextCursor = null` (dernière page).
Évite un `count` par page.

## Composants (à créer / modifier)

### 1.1 `lib/queries/factures.ts` — nouvelle query paginée

```ts
// Types publics
export interface FacturesPageParams {
  limit?: number; // défaut 25 ; borné [1, 100]
  cursor?: string | null; // base64url({ s: numero_seq, i: id }) ; null = page 1
  statuts?: Array<'emise' | 'payee' | 'en_retard' | 'avoir'>; // [] = tous (sauf a_emettre)
  searchRef?: string; // ilike sur ref (omnibox)
  filterProjet?: string; // ilike sur projet.ref
  filterClient?: string; // ilike sur client.raison_sociale
}

export interface FacturesPage {
  rows: FactureListItem[]; // type INCHANGÉ (réutilisé tel quel)
  nextCursor: string | null;
  total: number | null; // calculé page 1 uniquement, sinon null
}

export async function getFacturesPage(
  params: FacturesPageParams = {},
): Promise<FacturesPage>;
```

Squelette (mêmes `.select`, `.eq('client.archive', false)`, `.neq('statut','a_emettre')` que l'actuel —
on **réutilise** la projection existante, pas une nouvelle convention) :

```ts
const limit = clamp(params.limit ?? 25, 1, 100);
let q = supabase
  .from('factures')
  .select(SELECT_LIST) // même chaîne que getFacturesList
  .eq('client.archive', false)
  .neq('statut', 'a_emettre');

if (params.statuts?.length) q = q.in('statut', params.statuts);
if (params.searchRef?.trim())
  q = q.ilike('ref', `%${params.searchRef.trim()}%`);
if (params.filterProjet?.trim())
  q = q.ilike('projet.ref', `%${params.filterProjet.trim()}%`);
if (params.filterClient?.trim())
  q = q.ilike('client.raison_sociale', `%${params.filterClient.trim()}%`);

const cur = decodeCursor(params.cursor); // zod ; invalide -> undefined
if (cur)
  q = q.or(`numero_seq.lt.${cur.s},and(numero_seq.eq.${cur.s},id.lt.${cur.i})`);

q = q
  .order('numero_seq', { ascending: false })
  .order('id', { ascending: false })
  .limit(limit + 1);

const { data, error } = await q;
if (error) {
  logger.error('queries.factures', 'getFacturesPage failed', { error });
  throw new AppError(
    'FACTURES_FETCH_FAILED',
    'Impossible de charger les factures',
    { cause: error },
  );
}

const hasMore = data.length > limit;
const rows = hasMore ? data.slice(0, limit) : data;
const last = rows.at(-1);
const nextCursor =
  hasMore && last ? encodeCursor({ s: last.numero_seq, i: last.id }) : null;

let total: number | null = null;
if (!params.cursor) {
  // page 1 : count exact, MÊMES filtres
  let cq = supabase
    .from('factures')
    .select('id', { count: 'exact', head: true })
    .eq('client.archive', false)
    .neq('statut', 'a_emettre');
  if (params.statuts?.length) cq = cq.in('statut', params.statuts);
  if (params.searchRef?.trim())
    cq = cq.ilike('ref', `%${params.searchRef.trim()}%`);
  // (projet/client : voir Risques — count sur embedded ilike)
  const { count } = await cq;
  total = count ?? 0;
}
return { rows, nextCursor, total };
```

`encodeCursor` / `decodeCursor` : petits helpers locaux (zod schema `{ s: number, i: uuid string }`).
**`getFacturesList()` est conservée** le temps de la bascule UI, puis supprimée (cutover propre — pas de
shim laissé) une fois `page.tsx` migré. Le type `FactureListItem` (`factures.ts:36-38`) est réutilisé tel
quel ⇒ zéro changement aux colonnes.

### 1.2 `lib/actions/factures/list.ts` — Server Action « page suivante / re-filtrage »

Action serveur (admin only, garde alignée sur `page.tsx:34` `isAdmin`) qui wrappe `getFacturesPage` pour les
appels client (« Voir plus », changement de filtre/recherche). Renvoie `FacturesPage` sérialisable. Pas de
nouvel endpoint REST : on suit le pattern Server Action du repo.

### 1.3 `app/(dashboard)/facturation/page.tsx` — SSR de la 1re page

Remplacer `getFacturesList()` (ligne 48) par `getFacturesPage({ limit: 25 })`. Passer
`facturesPage={ rows, nextCursor, total }` (+ la Server Action) au client. Les autres fetchs du
`Promise.all` (échéances, brouillons…) sont inchangés.

### 1.4 `components/shared/data-table/data-table.tsx` — mode serveur (opt-in)

Étendre `DataTableProps` (additif, défaut = comportement actuel — **aucune** des ~30 autres tables impactée) :

```ts
serverMode?: boolean;                       // défaut false
onQueryChange?: (q: { searchRef?: string; statuts?: string[];
                      filterProjet?: string; filterClient?: string }) => void; // debounce 300ms
onLoadMore?: () => void;                     // « Voir plus »
nextCursor?: string | null;                  // présence => bouton actif
total?: number | null;
isLoadingMore?: boolean;
```

Quand `serverMode` :

- ne pas brancher `getPaginationRowModel` / `getFilteredRowModel` (données = page courante déjà filtrée serveur) ;
- la toolbar (`data-table-toolbar`) émet `onQueryChange` (recherche + facettes + filtres colonnes) au lieu
  de muter le state local ;
- remplacer `<DataTablePagination>` par un footer « N résultats — [Voir plus] » piloté par `nextCursor` ;
- **tri figé** à `numero_seq DESC` (le keyset n'a qu'une clé d'ordre). Désactiver les en-têtes tri-able en
  mode serveur (sinon faux signal). Compromis UX documenté en Risques.

### 1.5 Export Excel — endpoint serveur dédié

`handleExport` (`facturation-page-client.tsx:140-159`) lit `factures` in-memory → cassé par la pagination.
Nouvel endpoint `app/api/factures/export/route.ts` (admin only) qui **streame toutes les lignes** respectant
les filtres courants, en bouclant `getFacturesPage` côté serveur (curseur interne, page de 500) jusqu'à
épuisement, et génère le `.xlsx` (mêmes colonnes que lignes 142-151). Garde-fou : cap dur (p. ex. 50 000
lignes) + `logger.warn` si dépassé (pas de Sentry). L'UI appelle cet endpoint au lieu de mapper le state.

### 1.6 `getBrouillons()` — borne de sûreté

Les brouillons (`a_emettre`) sont opérationnellement bornés (on les vide en émettant) mais la query est
non bornée (`factures.ts:62`). Ajout défensif : `.limit(500)` + `logger.warn('queries.factures', 'brouillons

> 500, possible backlog')`si`data.length === 500`. Pas de keyset (volume structurellement petit) — juste
> un plafond pour ne jamais charger un backlog pathologique d'un coup.

## Plan d'implémentation (TDD)

1. **(rouge)** Activer/écrire les tests `getFacturesPage` (cf. §Tests) : keyset, `limit+1`, curseur,
   filtres, count page 1 only. Ils échouent (fonction absente).
2. **(vert)** Implémenter `encodeCursor`/`decodeCursor` + `getFacturesPage` dans `factures.ts`. Tests verts.
3. Migration index keyset (§ci-dessous) — **avant** le déploiement de la query en prod (sinon full scan).
4. Server Action `list.ts` + bascule `page.tsx` sur `getFacturesPage`.
5. Mode serveur `DataTable` + branchement `facturation-page-client.tsx` (`onQueryChange`/`onLoadMore`).
6. Endpoint export + remplacement de `handleExport`.
7. Borne `getBrouillons`.
8. Supprimer `getFacturesList()` (plus aucun appelant) — cutover propre.

### Migration index (additive, safe Supavia)

`supabase/migrations/<ts>_factures_keyset_index.sql` :

```sql
-- Index keyset pour la pagination serveur de /facturation (tri numero_seq DESC, id DESC).
-- Partiel : exclut les brouillons (a_emettre -> numero_seq NULL, jamais listés ici).
-- Additif, IF NOT EXISTS, lock bref (volume modéré). Aucun impact sur les triggers
-- gapless/freeze (index transparent en lecture).
CREATE INDEX IF NOT EXISTS idx_factures_keyset_seq_id
  ON public.factures (numero_seq DESC, id DESC)
  WHERE statut <> 'a_emettre';
```

**Ordre de déploiement** : la migration index est **purement additive** (aucune dépendance du code
existant, IF NOT EXISTS). Elle peut donc partir avec ou avant le code. Recommandé : **migration d'abord**
(merge sur `main` → auto-appliquée sur Supavia), puis le code qui s'appuie dessus pour de bonnes perfs dès
le 1er rendu. Aucun risque même si l'ordre s'inverse : sans index, la query fonctionne (juste un scan trié).

## Tests

### Vitest — `__tests__/factures-queries.test.ts` (remplace les `it.skip` lignes 425-436)

Le mock `buildSupabase` (lignes 60-138) doit gagner les chaînons `or`, `ilike`, `limit`, `range`, et le
support `count`/`head` (déjà présent dans le mock jumeau de `dashboard-queries.test.ts:58-153`). Cas :

- **keyset page 1** : `getFacturesPage({ limit: 2 })` → assert `order('numero_seq', desc)` + `order('id', desc)`,
  `.limit(3)` (limit+1), `.or` **absent** (pas de curseur), un `count exact head` émis.
- **`nextCursor` quand 3 lignes pour limit 2** : mock renvoie 3 rows → `rows.length === 2`, `nextCursor` non
  null, décodable en `{ s, i }` égal à la 2e ligne.
- **dernière page** : mock renvoie 2 rows pour limit 2 → `nextCursor === null`.
- **keyset page 2** : `cursor` fourni → assert `.or('numero_seq.lt.<s>,and(numero_seq.eq.<s>,id.lt.<i>)')`
  émis, et **aucun** `count` (total reste `null`).
- **filtre statut** : `statuts: ['emise','payee']` → `.in('statut', [...])`.
- **recherche ref** : `searchRef: 'FAC-SOL-0007'` → `.ilike('ref', '%FAC-SOL-0007%')`.
- **filtre projet/client** : `.ilike('projet.ref', ...)`, `.ilike('client.raison_sociale', ...)`.
- **invariants conservés** : `.neq('statut','a_emettre')` + `.eq('client.archive', false)` toujours présents.
- **curseur invalide** : `cursor: 'pas-du-base64'` → pas de `.or`, repart page 1 (et recompte le total).
- **`getBrouillons` borne** : assert `.limit(500)`.

### Vitest — helpers curseur (`__tests__/factures-cursor.test.ts`, nouveau)

- `decodeCursor(encodeCursor(x)) === x` (round-trip).
- `decodeCursor('garbage') === undefined` (zod rejette sans throw).

## Risques / Hors-périmètre

- **`count exact` + `ilike` sur embedded (projet/client)** : PostgREST applique le filtre embedded sur la
  jointure, pas sur le count de la table de base. Si le filtre porte sur projet/client, le `total` page 1
  peut diverger des lignes filtrées. Mitigation : (a) ne calculer le `total` que pour les filtres sur
  colonnes de base (`statut`, `ref`) et afficher « 25+ » sinon, ou (b) router projet/client par le RPC
  `search_factures_ids` (alternative §E). À trancher à l'implémentation ; **ne bloque pas** le keyset.
- **Perte du saut de page arbitraire** : keyset = next/prev/« voir plus » seulement. Aligné sur l'usage
  (consultation chronologique). Hors-périmètre : pagination numérotée.
- **Tri figé `numero_seq DESC` en mode serveur** : trier par montant/échéance nécessiterait d'autres index
  keyset + curseurs ⇒ hors-périmètre (le tri par défaut actuel est déjà `ref desc`).
- **Multi-société** : le tri reste global (comportement actuel) ; le tie-breaker `id` garantit la
  correction. Un tri/segmentation par série est hors-périmètre.

---

# CHANTIER 2 — RPC de comptage des statuts (dashboard pie chart)

## Problème (preuve code)

`lib/queries/dashboard/charts.ts:151-168` — `getInvoiceStatusBreakdown()` :

```ts
const { data, error } = await supabase.from('factures').select('statut'); // plein-table
…
return {
  emises:    factures.filter((f) => f.statut === 'emise').length,
  payees:    factures.filter((f) => f.statut === 'payee').length,
  en_retard: factures.filter((f) => f.statut === 'en_retard').length,
  avoirs:    factures.filter((f) => f.statut === 'avoir').length,
};
```

On rapatrie **une ligne par facture de l'historique** (colonne `statut`) pour finir en 4 entiers. Appelé à
chaque rendu du dashboard (`app/(dashboard)/dashboard/page.tsx:68`, `revalidate = 30`), pour **tous les
utilisateurs** (admin ET cdp). Un `count(*) GROUP BY statut` côté SGBD renvoie 4 lignes au lieu de N, et
peut s'appuyer sur `idx_factures_statut` (`00031_indexes.sql:28`).

## Objectif

Comptage **borné côté base** (4 lignes max transférées), **à RLS scoping identique** à l'actuel.

### Invariant de scoping à préserver (subtil mais critique)

Le `select('statut')` actuel passe par PostgREST ⇒ **RLS appliquée** : un admin voit tout
(`factures_select … is_admin()`), un CDP ne voit que ses projets
(`20260615130000_rls_is_admin_initplan_select.sql:70-73`). Le breakdown est donc **déjà scopé**. Le RPC
**doit reproduire exactement** ce scoping ⇒ **`SECURITY INVOKER`** (la RLS de l'appelant s'applique au
`GROUP BY`). Un `SECURITY DEFINER` ferait fuiter les comptes globaux à un CDP — interdit.

## Conception

### Décision A — `SECURITY INVOKER` (vs DEFINER)

|                      | DEFINER                                                                  | **INVOKER (retenu)**                               |
| -------------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| RLS au sein du count | contournée (compte global pour tous)                                     | appliquée (admin=global, cdp=ses projets)          |
| Parité avec l'actuel | **non** (régression sécurité)                                            | **oui**                                            |
| Précédent repo       | `find_prospect_duplicates` (a justement dû être durci, `20260630131000`) | `get_or_create_projet_libre` (`20260630120000:31`) |

INVOKER reproduit le comportement de `from('factures').select(...)`. Précédent direct : `get_or_create_projet_libre`
est INVOKER pour laisser la RLS trancher (`20260630120000_projets_libre.sql:26-31`).

### Décision B — Forme : `RETURNS TABLE(statut, n)`

Renvoyer les paires `(statut, count)` brutes (filtrées au besoin côté SQL), et **mapper en JS** vers la
forme `InvoiceStatusBreakdown` (`shared.ts:35-40`). Avantage : le type généré reste simple, la fonction ne
connaît pas la forme UI, et les statuts absents (count 0) sont gérés par défaut côté JS — comportement
identique à l'actuel (les `.filter().length` valent 0 si absent). On exclut `a_emettre` côté SQL (jamais
dans le pie chart aujourd'hui : aucun bucket ne le compte).

### Décision C — `search_path` épinglé + GRANT authenticated

Aligné sur l'hygiène du schéma (`get_prospect_time_in_stage_median`, `20260610120000…:28`) :
`SET search_path = public, pg_catalog`. `REVOKE … FROM PUBLIC/anon` puis `GRANT EXECUTE … TO authenticated`
(le dashboard est authentifié ; anon n'a rien à y faire).

## Composants

### 2.1 Migration RPC — `supabase/migrations/<ts>_count_factures_by_statut.sql`

```sql
-- Comptage des factures par statut pour le pie chart du dashboard.
-- Remplace un SELECT plein-table + count en JS (charts.ts:154) par un
-- count(*) GROUP BY statut côté base (s'appuie sur idx_factures_statut).
-- SECURITY INVOKER : la RLS de l'appelant s'applique au GROUP BY, donc le
-- scoping est IDENTIQUE au select actuel (admin = global, cdp = ses projets).
-- Exclut 'a_emettre' (brouillons, jamais comptés dans le breakdown).
CREATE OR REPLACE FUNCTION public.count_factures_by_statut()
RETURNS TABLE (statut statut_facture, n bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  SELECT f.statut, count(*) AS n
  FROM public.factures f
  WHERE f.statut <> 'a_emettre'
  GROUP BY f.statut;
$$;

REVOKE EXECUTE ON FUNCTION public.count_factures_by_statut() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_factures_by_statut() FROM anon;
GRANT  EXECUTE ON FUNCTION public.count_factures_by_statut() TO authenticated;
```

### 2.2 `types/database.ts` — type généré (régénéré, pas écrit à la main)

Après application, `supabase gen types` ajoute dans le bloc `Functions` (`types/database.ts:3769-3827`) :

```ts
count_factures_by_statut: {
  Args: never;
  Returns: {
    statut: Database['public']['Enums']['statut_facture'];
    n: number;
  }
  [];
}
```

### 2.3 `lib/queries/dashboard/charts.ts:151-168` — consommer le RPC

```ts
export async function getInvoiceStatusBreakdown(): Promise<InvoiceStatusBreakdown> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('count_factures_by_statut');
  if (error)
    logger.error('queries.dashboard', 'getInvoiceStatusBreakdown failed', {
      error,
    });

  const byStatut = new Map<string, number>(
    (data ?? []).map((r) => [r.statut, Number(r.n)]),
  );
  return {
    emises: byStatut.get('emise') ?? 0,
    payees: byStatut.get('payee') ?? 0,
    en_retard: byStatut.get('en_retard') ?? 0,
    avoirs: byStatut.get('avoir') ?? 0,
  };
}
```

Comportement **identique** (mêmes 4 clés, 0 si statut absent), erreur → toujours 0 (pas de throw — le
dashboard ne casse pas). Si le type n'est pas encore régénéré, fallback `('count_factures_by_statut' as never)`
avec cast runtime, comme `getProspectTimeInStageMedian` (`lib/queries/prospects.ts:162-177`).

## Plan d'implémentation (TDD)

1. **(rouge)** Réécrire le test `getInvoiceStatusBreakdown` (`__tests__/dashboard-queries.test.ts:328-357`)
   pour mocker `.rpc('count_factures_by_statut')` renvoyant `[{statut:'emise',n:2}, …]` au lieu de
   `from('factures').select('statut')`. Échoue (code lit encore `from().select()`).
2. Écrire la migration RPC (§2.1).
3. **(vert)** Brancher `getInvoiceStatusBreakdown` sur `.rpc(...)`. Test vert.
4. pgTAP (§Tests) pour valider RLS-scoping + sécurité de la fonction.
5. Régénérer `types/database.ts` ; retirer le cast `as never` si présent.

### Ordre de déploiement prod

La fonction est **additive** : créer un RPC ne casse aucun chemin existant. Recommandé : **migration RPC
mergée en premier** (auto-appliquée sur Supavia), **puis** le code qui l'appelle. Si l'ordre s'inverse
transitoirement (code avant fonction), `.rpc()` renvoie une erreur PostgREST `PGRST202` (fonction inconnue)
→ branche `if (error)` → breakdown à 0 (dashboard dégradé mais **non cassé**). Comme la fonction est
purement additive, ce risque est borné et auto-résorbé dès l'application de la migration.

## Tests

### Vitest — `__tests__/dashboard-queries.test.ts` (réécrit `getInvoiceStatusBreakdown`)

- `.rpc('count_factures_by_statut')` renvoie `[{statut:'emise',n:2},{statut:'payee',n:1},
{statut:'en_retard',n:1},{statut:'avoir',n:1}]` → `{ emises:2, payees:1, en_retard:1, avoirs:1 }`.
- statut absent (RPC ne renvoie que `[{statut:'emise',n:5}]`) → `{ emises:5, payees:0, en_retard:0, avoirs:0 }`
  (préserve le comportement « 0 si absent »).
- erreur RPC (`{ data:null, error:{...} }`) → `{ emises:0, payees:0, en_retard:0, avoirs:0 }` + `logger.error`
  appelé (mocké `dashboard-queries.test.ts:21-23`), pas de throw.

### pgTAP — `supabase/tests/23_count_factures_by_statut.sql`

Calqué sur `21_factures_projet_libre.sql` (helper `set_config('request.jwt.claims', …)` + `SET LOCAL role
authenticated`, lignes 52-62) pour exercer le scoping RLS.

```sql
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(6);

-- Fixtures : admin, cdp, client, projet du cdp + projet libre (cdp_id NULL)
-- … (insert auth.users + public.users admin/cdp, clients, projets) …

-- Seed factures émises : 2 emise + 1 payee sur le projet DU CDP,
-- + 1 emise + 1 avoir + 1 a_emettre sur un projet libre (cdp ne voit pas).

-- 1. La fonction existe et est SECURITY INVOKER (prosecdef = false)
SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE proname = 'count_factures_by_statut'),
  false, 'count_factures_by_statut est SECURITY INVOKER');

-- 2. search_path épinglé
SELECT ok(
  (SELECT proconfig::text FROM pg_proc WHERE proname='count_factures_by_statut')
  LIKE '%search_path=public, pg_catalog%', 'search_path épinglé');

-- 3. EXECUTE accordé à authenticated, pas à anon
SELECT ok( has_function_privilege('authenticated', 'public.count_factures_by_statut()', 'EXECUTE'),
  'authenticated peut EXECUTE');
SELECT ok( NOT has_function_privilege('anon', 'public.count_factures_by_statut()', 'EXECUTE'),
  'anon ne peut PAS EXECUTE');

-- 4. Helper : exécute le RPC sous une identité donnée, renvoie le n pour un statut
CREATE OR REPLACE FUNCTION pg_temp.count_as(p_user UUID, p_statut statut_facture)
RETURNS bigint LANGUAGE plpgsql AS $f$
DECLARE v bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
  SELECT COALESCE((SELECT n FROM public.count_factures_by_statut() WHERE statut = p_statut), 0) INTO v;
  RESET role;
  RETURN v;
END; $f$;

-- 5. Admin voit le total global (2 emise toutes confondues : projet cdp + projet libre)
SELECT is( pg_temp.count_as((SELECT admin_id FROM _ctx), 'emise'), 2::bigint,
  'Admin : count emise global');

-- 6. CDP ne voit QUE ses projets (1 emise sur son projet, pas celle du projet libre)
SELECT is( pg_temp.count_as((SELECT cdp_id FROM _ctx), 'emise'), 1::bigint,
  'CDP : count emise scopé à ses projets (RLS via SECURITY INVOKER)');

SELECT * FROM finish();
ROLLBACK;
```

(Le test asserte aussi implicitement l'exclusion de `a_emettre` : la facture brouillon seedée n'est jamais
comptée.)

## Risques / Hors-périmètre

- **`bigint` → number** : `count(*)` renvoie `bigint` (typé `number` par gen-types, sérialisé string par
  PostgREST). Le `Number(r.n)` du mapping couvre les deux cas. Aux volumes factures, aucun dépassement
  `Number.MAX_SAFE_INTEGER`.
- **Cohérence transactionnelle** : `STABLE` ⇒ snapshot de la transaction de lecture, suffisant pour un KPI
  d'affichage (déjà le cas avec `revalidate = 30`).
- **Hors-périmètre** : étendre le RPC à d'autres agrégats dashboard (montants, tendances) — chaque agrégat
  a sa propre logique (`getMonthlyTrend`, `getDashboardFinancials`) ; non touchés ici.

---

## Récapitulatif des migrations (ordre de merge conseillé)

| Ordre | Fichier                             | Nature                        | Bloquant ?       |
| ----- | ----------------------------------- | ----------------------------- | ---------------- |
| 1     | `<ts>_factures_keyset_index.sql`    | CREATE INDEX partiel, additif | Non (perf only)  |
| 2     | `<ts>_count_factures_by_statut.sql` | CREATE FUNCTION, additif      | Non (fallback 0) |

Les deux sont **additives et idempotentes-friendly** (IF NOT EXISTS / CREATE OR REPLACE), donc sûres sur
Supavia même si le code applicatif arrive avant ou après. Aucun impact sur les invariants factures
(numérotation, no-delete, freeze) : index transparent en lecture, RPC en lecture seule `SECURITY INVOKER`.
