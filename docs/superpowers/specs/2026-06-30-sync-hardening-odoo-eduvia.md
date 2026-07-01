# Design — Durcissement fiabilité de la synchronisation Odoo / Eduvia

Date : 2026-06-30
Statut : **design (non implémenté)**

> Quatre chantiers indépendants issus de l'audit robustesse/perf/sync. Chacun corrige une faille de
> fiabilité prouvée dans le code (citations `fichier:ligne`). Aucun ne touche aux invariants légaux
> factures (numérotation gapless, aucun DELETE facture/ligne, montants cents entiers, immuabilité
> post-émission via `freeze_facture_after_emission`, `projet_id NOT NULL`). Tout SQL proposé est
> additif ; le code est déployé **avant** toute contrainte. Logging exclusivement via
> `lib/utils/logger.ts` (jamais de nouvel envoi Sentry).
>
> Les quatre chantiers peuvent être implémentés et déployés séparément. Ordre de risque croissant :
> C2 (bug perf pur, aucun effet DB) → C1 (idempotence Odoo, lecture seule additionnelle) →
> C3 (cleanup orphan, lecture/delete par PK) → C4 (dédup notif, nouvelle ligne de log + 1 requête).

---

## Chantier 1 — Idempotence serveur de `pushAnalyticLineForMove`

### Problème (preuve code)

`OdooClient.pushAnalyticLineForMove` (`lib/odoo/client.ts:774-823`) résout le compte analytique par
`code`, puis crée **directement** la ligne analytique sans recherche préalable :

```
813: const id = await this.executeKw<number>('account.analytic.line', 'create', [
814:   vals,
815: ]);
```

À comparer avec `pushMove` (`lib/odoo/client.ts:631-643`) qui, lui, fait un `search_read`
avant `create` pour garantir l'idempotence côté Odoo :

```
637: const existing = await this.executeKw<ExistingMove[]>(
638:   'account.move',
639:   'search_read',
640:   [existingDomain],          // [['ref','=',ref],['move_type','=',type],['company_id','=',companyId]]
641:   { fields: ['id', 'state'], limit: 1 },
642: );
```

La seule barrière d'idempotence actuelle de l'analytique est applicative :
`facture_lignes.analytic_line_odoo_id` (`lib/odoo/sync.ts:236` : `if (l.analytic_line_odoo_id) continue;`).
Or cette barrière **a un trou documenté dans le code lui-même** : si le `create` réussit côté Odoo
mais que la persistance de l'id échoue, le code logge explicitement le risque
(`lib/odoo/sync.ts:262-274`) :

```
262: // La ligne analytique EST creee cote Odoo mais l'id n'a pas pu
263: // etre persiste : un re-push ulterieur la recreerait (doublon
264: // de CA analytique). On loggue pour detection (pas de Sentry).
```

Au run suivant, la ligne facture a toujours `analytic_line_odoo_id = NULL` → la boucle la re-pousse →
**doublon de chiffre d'affaires analytique côté Odoo** (le P&L d'un projet est gonflé). Le `name`
poussé est stable et discriminant (`lib/odoo/sync.ts:243`) :
`` `[SOLUVIA-AUTO] ${f.ref} - ${l.description.slice(0, 60)}` ``.

### Objectif / Invariants à préserver

- **Idempotence côté Odoo** : un re-push (persistance ratée, retry cron, re-run manuel) ne crée
  jamais un second `account.analytic.line` pour la même ligne facture.
- Aligner le contrat sur celui de `pushMove` : _search-before-create_, réutilisation de l'existant.
- **Invariants factures** : aucun. Les lignes analytiques ne touchent ni `factures`, ni
  `facture_lignes` côté contenu — seule la colonne `facture_lignes.analytic_line_odoo_id` (déjà
  présente, déjà écrite par le code actuel) est renseignée. Pas de DELETE, pas de migration.
- Best-effort non bloquant préservé : un échec analytique ne doit jamais faire échouer le push de la
  facture (comportement actuel `lib/odoo/sync.ts:277-283`).

### Conception (alternatives + choix)

**Domaine de recherche.** On reproduit le pattern `pushMove` : `search_read` sur
`account.analytic.line` avant `create`, filtré par les champs qui identifient la ligne de manière
stable et déterministe à partir des seules entrées de `OdooAnalyticLineInput`
(`lib/odoo/client.ts:179-186`) :

- `['name', '=', params.name]` — le `name` embarque `f.ref` + le début de la description : stable,
  non recyclé entre lignes (le `f.ref` est unique et gapless).
- `['account_id', '=', accountId]` — déjà résolu juste au-dessus (`client.ts:795`), scope le compte.
- `['date', '=', params.date]` — discrimine deux runs sur des périodes différentes.
- `['amount', '=', params.amount]` — discrimine un avoir/correctif de même libellé.

`limit: 1`. Si une ligne correspond, on la **réutilise** (retour `analytic_line_odoo_id = found.id`,
`skipped = false`) au lieu de créer. Le call-site re-lie alors la ligne facture orpheline à l'id
existant (`lib/odoo/sync.ts:254-260`), **fermant le trou** : la ligne créée mais non persistée est
retrouvée et ré-attachée au lieu d'être dupliquée.

**Alternative A — embarquer `facture_lignes.id` dans le `name`** (ex.
`[SOLUVIA-AUTO#<ligneId>] ...`) pour une clé parfaite. _Rejetée pour le chemin nominal_ : modifie un
libellé visible comptable déjà en production (rupture de cohérence avec l'historique déjà poussé) et
exige un changement de call-site. Conservée comme **durcissement futur optionnel** (cf. Hors-périmètre).

**Alternative B — clé d'idempotence Odoo native (`ref` sur analytic.line).** `account.analytic.line`
n'a pas de champ `ref` exploité ici ; ajouter un champ custom Odoo sort du périmètre Soluvia
(dépendance FINANCES-WISEMANH). _Rejetée._

**Choix : search_read sur `(name, account_id, date, amount)`** — zéro changement de call-site, zéro
changement de libellé, calque exact de `pushMove`, robuste au cas « create OK / persist KO » qui est
précisément le scénario de doublon documenté. Le quadruplet est suffisamment discriminant : deux
lignes réellement distinctes diffèrent par la description (donc le `name`) ou le montant ; deux lignes
**identiques** (même `name`+`amount`+`date`+compte) sont, par construction, le même fait comptable —
les fusionner est le mode de défaillance _sûr_ (on n'invente jamais de CA en double).

### Composants (fichiers à modifier, signatures, pas de SQL)

`lib/odoo/client.ts` — `pushAnalyticLineForMove` (≈ lignes 774-823) :

- Insérer, **après** la résolution de `accountId` (l.795) et **avant** le `create` (l.813), un
  `search_read` :

```ts
// Idempotence : reutilise une ligne analytique deja poussee pour ce
// (name, compte, date, montant). Sans cette recherche, un re-push apres
// un echec de persistance de analytic_line_odoo_id recree un doublon de CA.
const existing = await this.executeKw<{ id: number }[]>(
  'account.analytic.line',
  'search_read',
  [
    [
      ['name', '=', params.name],
      ['account_id', '=', accountId],
      ['date', '=', params.date],
      ['amount', '=', params.amount],
    ],
  ],
  { fields: ['id'], limit: 1 },
);
const found = existing[0];
if (found) {
  logger.info(SCOPE, 'Reusing existing analytic line', {
    analytic_line_odoo_id: found.id,
    account_id: accountId,
    name: params.name,
  });
  return { analytic_line_odoo_id: found.id, skipped: false };
}
```

- Signature publique **inchangée** (`{ analytic_line_odoo_id, skipped, reason? }`). Le call-site
  `lib/odoo/sync.ts:254-260` re-lie déjà l'id retourné quand `skipped === false` → aucun changement
  côté `sync.ts`.

### Plan d'implémentation (TDD)

1. **Test rouge** (`__tests__/odoo-sync.test.ts` _ou_ un nouveau `__tests__/odoo-analytic-idempotent.test.ts`
   calqué sur `__tests__/odoo-ensure-reconcile-model.test.ts`) : mocker `global.fetch`, décoder le
   corps JSON-RPC via `decodeKw`, simuler un `account.analytic.line.search_read` renvoyant `[{id:99}]`.
   Assertion : `create` **n'est pas** appelé, retour `{ analytic_line_odoo_id: 99, skipped: false }`.
2. **Implémentation** : insérer le `search_read` ci-dessus.
3. **Test vert** + cas « pas d'existant » : `search_read → []`, alors `create` appelé une fois.
4. Aucun ordre de déploiement particulier (pas de migration). Déployable seul.

### Tests (vitest, mocks transport existants)

Réutiliser le harnais `decodeKw` + `fetchMock` de `__tests__/odoo-ensure-reconcile-model.test.ts`
(qui mocke `common.authenticate → uid` puis route par `call.model`/`call.method`) :

- **`reuse_when_exists`** : `account.analytic.account.search → [12]`,
  `account.analytic.line.search_read → [{id:99}]`. Attendu : pas d'appel `create` sur
  `account.analytic.line`, résultat `{analytic_line_odoo_id:99, skipped:false}`.
- **`create_when_absent`** : `search_read → []`, `create → 77`. Attendu : 1 `create`, résultat
  `{analytic_line_odoo_id:77, skipped:false}`.
- **`skip_when_account_missing`** : `account.analytic.account.search → []`. Attendu : ni `search_read`
  ni `create` sur la ligne, `skipped:true` (comportement actuel, non régressé).
- **`discriminate_by_amount`** (régression doublon) : un `search_read` filtré sur amount=100 → `[]`
  alors qu'une ligne amount=200 existe ; vérifier que le `create` part bien (les deux lignes
  coexistent, pas de faux positif d'idempotence).

### Risques / Hors-périmètre

- **Risque faux positif** : deux lignes facture légitimement identiques (même libellé tronqué, même
  montant, même date, même compte) seraient fusionnées en une seule ligne analytique. Probabilité
  faible (le `name` porte `f.ref` + description) et mode de défaillance _sûr_ (jamais de CA gonflé).
  Si la granularité ligne-à-ligne devient critique → Alternative A (`#<ligneId>` dans le `name`).
- **+1 round-trip Odoo par ligne** poussée (search_read avant create). Négligeable : la boucle est
  déjà best-effort, séquentielle, et ne s'exécute que pour les lignes au `analytic_line_odoo_id` nul.
- **Hors-périmètre** : `pushAvoirs` ne pousse aucune ligne analytique (constat `2026-06-29-projet-libre`
  §Faits analytiques) — ce chantier ne change pas ce fait. Renommer le `name` analytique (Alt. A).

---

## Chantier 2 — Borner la concurrence de pagination Eduvia + corriger `PER_PAGE`

### Problème (preuve code)

`fetchAllPages` (`lib/eduvia/client.ts:380-424`) tire **toutes les pages restantes en parallèle non
borné** :

```
399: const remainingResults = await Promise.all(
400:   remainingPages.map((page) =>
401:     fetchJson<EduviaApiResponse<T>>(
402:       `${baseUrl}/api/v1/${resource}?page=${page}&per_page=${PER_PAGE}`,
403:       apiKey,
404:     ),
405:   ),
406: );
```

Cette fonction est appelée **par contrat** (`fetchContractInvoiceLines`, `fetchContractInvoices` :
`client.ts:483-513`), et la boucle contrat tourne déjà sous `mapWithConcurrency(5)`
(`lib/eduvia/sync.ts:587-589` et `644-647`, `CONTRACT_SYNC_CONCURRENCY = 5` à `sync.ts:36`). Résultat :
jusqu'à **5 contrats × (N pages chacun) requêtes simultanées** → rafale incontrôlée vers l'API Eduvia
sur les gros tenants (risque 429 / cold-start Cloudflare, le timeout de fonction sync est à 300 s).

Aggravé par un **mismatch de pagination** : `PER_PAGE = 100` (`client.ts:226`) alors que la doc Eduvia
plafonne à **25** — fait écrit deux fois dans le code lui-même (`client.ts:480` et `client.ts:499` :
« per_page Eduvia = 25 »). Demander `per_page=100` à une API qui cap à 25 fait que `meta.total_pages`
est calculé sur 25 → on émet **4× plus de pages** que prévu, multipliant la rafale.

### Objectif / Invariants à préserver

- Une seule fonction `fetchAllPages` qui **borne** le nombre de fetchs de pages en vol, même appelée
  en parallèle par 5 contrats.
- `PER_PAGE` reflète la réalité de l'API (25) pour que `total_pages` soit correct.
- Ordre des items préservé (les passes orphan-cleanup s'appuient sur la complétude de la liste, pas sur
  l'ordre, mais on ne régresse pas).
- **Invariants factures** : aucun (lecture API pure, aucune écriture DB ici).

### Conception (alternatives + choix)

**Réutiliser `mapWithConcurrency`** (`lib/utils/concurrency.ts:15`, déjà importé dans le module sync)
**à l'intérieur de `fetchAllPages`** pour les pages restantes, en remplacement du `Promise.all` nu.
`mapWithConcurrency` préserve l'ordre (`result[i] === fn(items[i])`, doc l.10) → l'agrégation reste
déterministe.

**Cap par appel `PAGE_FETCH_CONCURRENCY` (proposé : 4).** Combiné au pool contrat de 5, le plafond
global de fetchs Eduvia en vol passe d'« illimité » à **5 × 4 = 20** au pire — borné, prévisible,
poli. (Les passes top-niveau `employees`/`formations`/`companies` à `sync.ts:231-242` tournent en
`Promise.all` de 3 → 3 × 4 = 12, également borné.)

**Corriger `PER_PAGE` à 25.** Aligne la demande sur le cap serveur → `meta.total_pages` exact, ~4× moins
de pages générées. _Effet de bord positif_ : moins de requêtes totales, donc le cap de concurrence
suffit largement.

**Alternative — laisser `PER_PAGE=100` et borner seulement la concurrence.** _Rejetée_ : on continuerait
à sur-générer les pages (total_pages calculé sur 25) ; corriger les deux est cohérent et la doc/code
documente déjà 25.

**Alternative — sérialiser les pages (concurrency 1).** _Rejetée_ : tue le gain de latence sur les
contrats longs (raison d'être de `fetchAllPages` vs `fetchList`). Un petit pool garde l'essentiel du
parallélisme tout en étant poli (même philosophie que `mapWithConcurrency`, doc l.6-8).

### Composants (fichiers à modifier)

`lib/eduvia/client.ts` :

- `226: const PER_PAGE = 100;` → `const PER_PAGE = 25; // cap API Eduvia (cf. OpenAPI v1.0.0)`.
- Ajouter `const PAGE_FETCH_CONCURRENCY = 4;` près des constantes transport (≈ l.225-228).
- Importer `mapWithConcurrency` depuis `@/lib/utils/concurrency`.
- Réécrire le bloc `399-409` :

```ts
const remainingResults = await mapWithConcurrency(
  remainingPages,
  PAGE_FETCH_CONCURRENCY,
  (page) =>
    fetchJson<EduviaApiResponse<T>>(
      `${baseUrl}/api/v1/${resource}?page=${page}&per_page=${PER_PAGE}`,
      apiKey,
    ),
);
for (const result of remainingResults) {
  allItems.push(...result.data);
}
```

- Mettre à jour les commentaires `client.ts:480` / `client.ts:499` (déjà à « 25 », vérifier cohérence)
  et le test existant (cf. ci-dessous).

### Plan d'implémentation (TDD)

1. **Test rouge** : étendre `__tests__/client-fetch-invoice-lines.test.ts` avec un cas
   `total_pages = 9` et un `fetch` mock qui **compte les appels concurrents** (incrémente un compteur
   en entrée, décrémente en sortie, enregistre le max) → assertion `maxInFlight <= PAGE_FETCH_CONCURRENCY`.
   Échoue sur le code actuel (illimité).
2. **Implémentation** du cap + `PER_PAGE=25`.
3. **Test vert** ; ajuster les assertions d'URL existantes (`per_page=100 → per_page=25`,
   `client-fetch-invoice-lines.test.ts:51` et `pageResponse` l.30).

### Tests (vitest, mocks transport existants)

Réutiliser `pageResponse(data, {current_page,total_pages})` de
`__tests__/client-fetch-invoice-lines.test.ts` :

- **`per_page_is_25`** : assertion d'URL `...?page=1&per_page=25` (remplace l'attente actuelle à 100).
- **`bounded_concurrency`** : mock `fetch` instrumenté (compteur in-flight), `total_pages = 9`.
  Attendu : `maxConcurrent <= 4`, agrégat = 9 pages dans l'ordre, `fetch` appelé 9 fois.
- **`order_preserved`** : pages renvoyées dans le désordre temporel (délais inversés) → `allItems`
  reste page1..pageN dans l'ordre (garantie `mapWithConcurrency`).
- **`single_page_no_extra_fetch`** : `total_pages = 1` → un seul `fetch`, pas d'appel à
  `mapWithConcurrency` significatif (remainingPages vide).

### Risques / Hors-périmètre

- **Risque** : si l'API Eduvia accepte en réalité `per_page > 25` pour certains endpoints, passer à 25
  augmente le nombre de pages (latence légèrement supérieure par contrat). Compensé par le pool de
  pages (4) et le fait que la doc/code affirme déjà 25. Mesurable via le log
  `Fetched N items from <resource>` (`client.ts:411-421`).
- **Hors-périmètre** : `fetchList` (`client.ts:447-458`) est mono-requête non paginé — inchangé. Le
  pool contrat `CONTRACT_SYNC_CONCURRENCY=5` reste tel quel (le cap interne suffit à borner le produit).

---

## Chantier 3 — Chunking des listes `IN` du cleanup orphelin Eduvia

### Problème (preuve code)

Deux `not('eduvia_id','in', '(<liste géante>)')` interpolent **toute** la liste des ids API dans une
clause PostgREST :

`lib/eduvia/sync.ts:756-760` (sélection des steps orphelins) :

```
756: const { data: orphanRows, error: orphanSelErr } = await supabase
757:   .from('eduvia_invoice_steps')
758:   .select('id')
759:   .eq('contrat_id', contratId)
760:   .not('eduvia_id', 'in', `(${apiStepIds.join(',')})`);
```

`lib/eduvia/sync.ts:888-893` (delete des lignes orphelines) :

```
888: const apiLineIds = lines.map((l) => l.id);
889: const { error: deleteErr } = await supabase
890:   .from('eduvia_invoice_lines')
891:   .delete()
892:   .eq('contrat_id', contratId)
893:   .not('eduvia_id', 'in', `(${apiLineIds.join(',')})`);
```

Sur un contrat à fort volume (centaines de lignes/steps), `apiLineIds.join(',')` produit une URL
PostgREST qui peut **dépasser la limite de longueur d'URL** (PostgREST/PostgREST-via-Supabase rejette
ou tronque les requêtes au-delà de ~la limite serveur). Conséquence : le cleanup orphan **échoue** —
soit l'erreur remonte dans `result.errors` (cas steps, l.761-764), soit (cas lines) elle remonte dans
`deleteErr` (l.894-898) → les orphelins ne sont jamais purgés et **s'accumulent** (commissions /
écheances fantômes côté Soluvia). Le risque grandit linéairement avec la taille du contrat.

### Objectif / Invariants à préserver

- Le cleanup orphan fonctionne quel que soit le nombre d'ids API (pas de plafond d'URL).
- **Garde anti-wipe conservée à l'identique** : si l'API renvoie 0 step/ligne alors que la DB en a, on
  **skip** le delete (`sync.ts:744-753` et `877-886`). Ce garde-fou ne doit pas être contourné.
- **Garde légale steps conservée** : on ne supprime jamais un step adossé à une ligne de facture live
  (`event_type='opco_step'`, `est_avoir=false`, `event_source_id`) — logique `sync.ts:767-786`.
- **Invariants factures** : ces DELETE portent sur `eduvia_invoice_steps` / `eduvia_invoice_lines`
  (données sources Eduvia), **jamais** sur `factures`/`facture_lignes`. Aucun invariant légal facture
  n'est concerné. Pas de migration.

### Conception (alternatives + choix)

**Inverser la stratégie : calcul de la différence en mémoire + delete par PK en lots.** Au lieu de
pousser la liste API dans l'URL (`NOT IN <api>`), on :

1. `select id, eduvia_id` de toutes les lignes/steps **du contrat** (filtre `eq('contrat_id', …)` —
   URL courte, pas de liste géante). Le volume du résultat est borné par la taille du contrat,
   inévitable.
2. Calcule en mémoire `orphans = rowsDB.filter(r => !apiIdSet.has(r.eduvia_id))` (set lookup O(1)).
3. Applique le garde anti-wipe (déjà en place côté steps via `existingCount`; pour les lines, conserver
   le `if (lines.length === 0) skip` actuel `sync.ts:877-886`).
4. Pour les **steps** : applique en plus la garde légale (exclusion des `billedStepIds`, logique
   `sync.ts:767-786` inchangée — elle opère déjà sur la liste `deletable`).
5. `delete().in('id', chunk)` **par lots de `DELETE_CHUNK = 200`** sur les **clés primaires** (`id`),
   pas sur `eduvia_id`. La liste d'ids PK reste petite et bornée par chunk → URL maîtrisée.

Pour les **lines**, ce chantier **unifie le pattern sur celui, déjà plus sûr, des steps** : aujourd'hui
les lines font un delete direct `NOT IN` (`sync.ts:889-893`) sans même sélectionner d'abord ; on les
aligne sur « select → diff mémoire → delete par PK en lots », ce qui ajoute aussi pour les lines une
trace `invoice_lines_orphan_deleted` cohérente (à exposer dans `result` comme pour les steps).

**Helper partagé** `lib/utils/chunk.ts` (nouveau, ~10 lignes) :

```ts
export function chunk<T>(arr: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk size must be > 0');
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
```

(Aucun helper de chunking n'existe aujourd'hui — vérifié sous `lib/utils`.)

**Alternative — garder `NOT IN` mais chunker la liste API.** `NOT IN` ne se chunke pas naïvement :
`NOT IN (chunk1)` puis `NOT IN (chunk2)` supprime tout ce qui n'est pas dans _chaque_ chunk → faux
positifs massifs. Il faudrait l'intersection des survivants, plus complexe et fragile. _Rejetée._

**Alternative — RPC Postgres `delete ... where eduvia_id <> all($1)` avec array bindé.** Évite la
limite d'URL (corps POST), mais introduit une migration de fonction SQL + RLS, et un couplage au schéma.
_Rejetée_ : le diff-mémoire + delete-par-PK ne nécessite **aucune migration**, reste 100 % côté code, et
est trivialement testable sur le mock Supabase existant.

**Choix : select → diff mémoire → delete par PK chunké (200).** Zéro migration, URL bornée des deux
côtés, gardes anti-wipe et légale préservées, pattern unifié steps+lines.

### Composants (fichiers à modifier / créer)

- **Créer** `lib/utils/chunk.ts` (helper ci-dessus).
- `lib/eduvia/sync.ts` :
  - **Steps** (≈ l.754-806) : remplacer le `select().not('eduvia_id','in', …)` (l.756-760) par un
    `select('id, eduvia_id').eq('contrat_id', contratId)` + diff mémoire contre
    `new Set(steps.map(s => s.id))`. La suite (garde légale `billedStepIds`, `deletable`) reste, mais
    le `delete().in('id', deletable)` (l.788-791) devient une boucle `for (const c of chunk(deletable, 200))`.
  - **Lines** (≈ l.887-899) : remplacer le `delete().not('eduvia_id','in', …)` direct par
    `select('id, eduvia_id').eq('contrat_id', contratId)` + diff mémoire contre
    `new Set(lines.map(l => l.id))`, puis `delete().in('id', chunk)` par lots de 200. Conserver le garde
    `if (lines.length === 0) skip` (l.877-886). Exposer un compteur
    `result.invoice_lines_orphan_deleted` (ajouter au type `SyncClientResult`, `sync.ts:44-62`).
- `lib/eduvia/sync.ts` : importer `chunk` depuis `@/lib/utils/chunk`.
- Aucun SQL / migration.

### Plan d'implémentation (TDD)

1. **Test rouge `chunk`** (`__tests__/chunk.test.ts`) : `chunk([1..450], 200)` → 3 lots `[200,200,50]`,
   `chunk([], 200) → []`, `size<=0 → throw`.
2. Implémenter `chunk`.
3. **Test rouge sync** (`__tests__/eduvia-sync.test.ts`) : un contrat avec 450 steps DB dont 1 absent
   de l'API → vérifier qu'**au moins un** `delete().in('id', …)` est émis (jamais de `.not(...'in'...)`
   sur `eduvia_id`), et que le step facturé (`billedStepIds`) **n'est pas** supprimé.
4. Implémenter le diff + delete chunké.
5. **Test vert** + cas anti-wipe (API renvoie 0 → aucun delete, message d'erreur d'avertissement présent).
6. Déployable seul (pas de migration).

### Tests (vitest, mock Supabase de `eduvia-sync.test.ts`)

Le mock Supabase enregistre les `RecordedOp` (table/op/filters) — exploitable pour asserter la **forme**
des requêtes :

- **`no_in_list_on_eduvia_id`** : après sync d'un gros contrat, **aucun** `RecordedOp` n'a de filtre
  `kind:'not'`/`in` sur `eduvia_id` ; les deletes utilisent `in` sur `id`.
- **`chunked_delete`** : 450 orphelins → ≥ 3 ops `delete` sur `eduvia_invoice_steps`/`_lines`, chaque
  `in('id', …)` de taille ≤ 200.
- **`anti_wipe_skip`** : API renvoie 0 step alors que DB en a (count > 0) → 0 delete, message
  d'erreur « skip delete pour eviter wipe » présent (régression du garde `sync.ts:744-753`).
- **`legal_guard_billed_step_kept`** : un orphelin adossé à une `facture_lignes` (`opco_step`,
  `est_avoir=false`) → exclu du delete (régression `sync.ts:767-786`).
- **`lines_orphan_deleted_counter`** : `result.invoice_lines_orphan_deleted` reflète le nombre purgé.

### Risques / Hors-périmètre

- **Risque** : le `select` du contrat ramène toutes les lignes/steps en mémoire — borné par la taille du
  contrat, déjà la même borne que la liste API. Acceptable.
- **Garde légale** : ne s'applique qu'aux **steps** (les lines n'ont pas d'équivalent
  `event_source_id`). On ne l'invente pas pour les lines (comportement actuel conservé).
- **Hors-périmètre** : les passes top-niveau (`employees`/`formations`/`companies`) sont des upserts
  sans cleanup orphan `NOT IN` → non concernées. Pas de changement du seuil anti-wipe.

---

## Chantier 4 — Dédup des notifications d'annulation (webhook + cron)

### Problème (preuve code)

Deux chemins notifient les admins d'une annulation Odoo, **sans coordination** :

1. **Webhook** `app/api/webhooks/odoo/move-cancelled/route.ts:131-146` (latence basse) insère une
   notif par admin :

```
132: const { error: notifErr } = await supabase.from('notifications').insert(
133:   adminIds.map((adminId) => ({
134:     type: 'erreur_sync' as const,
135:     user_id: adminId,
136:     titre: 'Facture annulée côté Odoo',
137:     message,
138:     lien: facture.ref ? `/facturation/${facture.ref}` : null,
139:   })),
140: );
```

**et n'écrit aucun `odoo_sync_logs`** (filet de sécurité commenté l.9-10).

2. **Cron horaire** `lib/odoo/sync.ts:833-842` (`pullCancellations`) insère **la même notif** :

```
833: const notifsToCreate = adminIds.map((adminId) => ({
834:   type: 'erreur_sync' as const,
835:   user_id: adminId,
836:   titre: 'Facture annulée côté Odoo',
837:   message,
838:   lien: facture.ref ? `/facturation/${facture.ref}` : null,
839: }));
```

Le checkpoint `since` du cron lit le **dernier log cancellation** (`lib/odoo/sync.ts:738-748`) :

```
738: .from('odoo_sync_logs')
...
742: .eq('entity_type', 'cancellation')
743: .in('statut', ['success', 'partial'])
```

Comme le webhook n'écrit pas de log, le cron **re-détecte** le même move (il reste `state=cancel`,
`write_date >= since`, cf. `client.ts:1198-1209`) dans l'heure → **double notification admin** par
annulation. Aucune dédup : ni le webhook ni le cron ne vérifient l'existence d'une notif/log préalable
(contrairement à `notifyUnreconciledIncomingPayments`, `sync.ts:672-700`, qui dédupe par `(titre,lien)`).

### Objectif / Invariants à préserver

- **Exactly-once notification** par annulation : que le webhook arrive avant le cron, après, ou jamais,
  l'admin reçoit **une** notif.
- **Filet de sécurité préservé** : si le webhook se perd, le cron rattrape dans l'heure (intention
  `route.ts:9-10`).
- **Le checkpoint `since` ne doit pas régresser ni sauter** des annulations à cause des logs du webhook.
- **Invariants factures** : aucun. On n'écrit que `notifications` et `odoo_sync_logs`. Aucune mutation
  de `factures`/`facture_lignes`, aucun DELETE, pas de migration (la table `odoo_sync_logs` accepte déjà
  `entity_type='cancellation'` + `entity_id`, cf. `types/database.ts:2402-2430`).

### Conception (alternatives + choix)

**Option A — dédup par `(titre, lien)`** (calque `notifyUnreconciledIncomingPayments`,
`sync.ts:672-700`). Avant insert, `select lien from notifications where type='erreur_sync' and
titre='Facture annulée côté Odoo' and lien in (...)`. _Faiblesse_ : `lien` vaut `NULL` quand
`facture.ref` est absent (`route.ts:138`, `sync.ts:838`) → la dédup par `IN (NULL)` ne matche pas et
laisse passer le doublon pour les factures sans ref. Clé non fiable.

**Option B (choisie) — le webhook écrit un `odoo_sync_logs` cancellation _par move_, que le cron
respecte comme ancre de dédup, clé sur `facture.id`.** Trois pièces :

1. **Webhook** : après une notif réussie, écrire
   `logSync({direction:'pull', entity_type:'cancellation', entity_id: facture.id, statut:'success',
payload:{odoo_id, source:'webhook', write_date}})` — exactement la ligne que le cron écrit déjà
   par move (`sync.ts:852-862`), avec `source:'webhook'` pour la traçabilité.
2. **Cron** (`pullCancellations`) : **pré-charger** les `entity_id` des logs cancellation _par move_
   déjà écrits (webhook ou cron antérieur) pour le lot de factures concernées, puis **skip la notif** si
   `facture.id` y figure (move déjà traité). La ligne de log _globale_ finale (l.879-885) continue de
   faire avancer `since`.
3. **Tightening du checkpoint** : la requête `since` (`sync.ts:738-748`) doit ne lire que la ligne de
   log **globale du cron** (celle sans `entity_id`), pas les logs _par move_. Sinon un log webhook
   (au `created_at` antérieur au prochain run) deviendrait le « dernier » et **rétrécirait** la fenêtre
   `since` de façon incohérente. → ajouter `.is('entity_id', null)` à la requête checkpoint.

`logSync` est aujourd'hui **privé** dans `lib/odoo/sync.ts:27`. On l'**extrait** dans
`lib/odoo/sync-log.ts` (export `logSync`), réimporté par `sync.ts` **et** par le webhook — évite la
dérive de chaîne (`entity_type`, libellés) entre les deux chemins.

**Clé de dédup = `facture.id`** : toujours non-null (PK), insensible à l'absence de `ref` (faiblesse de
l'Option A levée). La dédup fonctionne aussi **cron↔cron** (un move annulé reste détecté plusieurs heures
tant que `state=cancel` ; aujourd'hui seul `since` le borne — l'ancre par move le rend idempotent).

**Pré-chargement (cron)** : `select entity_id from odoo_sync_logs where entity_type='cancellation' and
statut in ('success','partial') and entity_id in (<factureIds du lot>)`. Les `factureIds` viennent de la
résolution `move.odoo_id → facture.id` (déjà faite dans la boucle, `sync.ts:796-800`). Un `Set` de
`alreadyHandled` → `if (alreadyHandled.has(facture.id)) { processed++; continue; }` **avant** l'insert
notif.

> Pourquoi B plutôt que A : (i) clé PK robuste au `ref` nul ; (ii) réutilise une table et une écriture
> _déjà présentes_ côté cron (le cron écrit déjà le log par move l.852-862) — le webhook ne fait que
> s'aligner ; (iii) dédup transverse webhook↔cron **et** cron↔cron ; (iv) le filet de sécurité survit
> (si webhook perdu → pas de log par move → cron notifie normalement).

### Composants (fichiers à créer / modifier)

- **Créer** `lib/odoo/sync-log.ts` : déplacer la fonction `logSync` (`sync.ts:27-49`) telle quelle,
  `export async function logSync(...)`. Signature inchangée.
- `lib/odoo/sync.ts` :
  - Remplacer la déf locale de `logSync` par `import { logSync } from './sync-log';`.
  - `pullCancellations` checkpoint (l.738-748) : ajouter `.is('entity_id', null)` → ne lit que la ligne
    globale du cron.
  - Après le chargement des `cancellations` et avant la boucle : pré-charger
    `alreadyHandled = Set<factureId>` via un `select entity_id` (filtré `entity_type='cancellation'`,
    `statut in success/partial`, `entity_id in <ids résolus>`). Comme `factureId` n'est connu qu'après
    résolution par move, deux variantes :
    - **(b1)** résoudre d'abord toutes les factures (`select id, ref, est_avoir from factures where
odoo_id in (<moveIds>)`), construire la map, charger `alreadyHandled` en une requête, puis boucler ;
    - **(b2)** garder la boucle actuelle et faire, **par move**, un `select id` ciblé sur le log
      cancellation `entity_id = facture.id` avant l'insert notif.
      → **Choix (b1)** : 2 requêtes batch au lieu de N, cohérent avec le pré-fetch admin déjà fait
      (`sync.ts:767-771`).
  - Dans la boucle : `if (alreadyHandled.has(facture.id)) { processed++; continue; }` avant l.831.
- `app/api/webhooks/odoo/move-cancelled/route.ts` :
  - Importer `logSync` depuis `@/lib/odoo/sync-log`.
  - Après l'insert notif réussi (l.146), appeler
    `await logSync(supabase, {direction:'pull', entity_type:'cancellation', entity_id: facture.id,
statut:'success', payload:{odoo_id, source:'webhook', write_date: payload.write_date}});`.
  - (Optionnel défensif) avant de notifier, le webhook peut lui-même vérifier l'absence de log
    cancellation `entity_id=facture.id` pour éviter un double si deux webhooks arrivent — symétrique au
    cron. Recommandé.
- **Pas de migration** : `odoo_sync_logs(entity_type, entity_id, statut, payload)` existe déjà.
- L'`enum type_notification` (`'erreur_sync'`) et la table `notifications` sont inchangés.

### Plan d'implémentation (TDD + ordre de déploiement)

1. **Extraction `logSync`** dans `sync-log.ts` + réimport — _refactor pur_, tests existants verts
   (`odoo-sync.test.ts` mocke déjà `logSync` indirectement via le mock Supabase `odoo_sync_logs`).
2. **Test rouge cron** : deux runs `pullCancellations` consécutifs sur le même move (le mock renvoie un
   log cancellation `entity_id=factureId` après le 1er) → **un seul** insert notif au total. Échoue
   aujourd'hui (re-notifie).
3. Implémenter pré-fetch `alreadyHandled` + skip + `.is('entity_id', null)` sur le checkpoint.
4. **Test rouge webhook** : POST move-cancelled → notif **et** log cancellation par move écrits.
5. Implémenter l'écriture du log + (option) garde webhook.
6. **Test intégration** : webhook puis cron sur le même move → 1 notif (le cron skippe).
7. **Ordre de déploiement** : aucune migration → déploiement standard. **Aucune contrainte DB ajoutée**,
   donc pas de séquencement code-avant-migration. (Le seul effet de bord est plus de lignes
   `odoo_sync_logs` par move ; bénin.)

### Tests (vitest, mock Supabase de `odoo-sync.test.ts` + harnais webhook)

Mock Supabase chainable existant (`odoo-sync.test.ts:85+`), handler par table :

- **`cron_dedup_same_move`** : `odoo_sync_logs.select` renvoie un log `entity_id=factureId` →
  `notifications.insert` **non appelé** pour ce move, `processed` incrémenté.
- **`cron_notifies_when_no_prior_log`** : pas de log par move → insert notif émis (N admins).
- **`cron_checkpoint_ignores_per_move_logs`** : asserter que la requête `since` porte le filtre
  `entity_id is null` (via `RecordedOp.filters`) → le `since` ne lit que la ligne globale.
- **`cron_handles_null_ref`** : facture sans `ref` (lien null) → dédup par `facture.id` fonctionne
  (point faible de l'Option A couvert).
- **`webhook_writes_per_move_log`** : POST signé valide → `odoo_sync_logs.insert` avec
  `entity_type='cancellation'`, `entity_id=facture.id`, `payload.source='webhook'`.
- **`webhook_then_cron_single_notif`** : simuler l'état post-webhook (log présent) → run cron → 0 notif.
- **`logSync_extracted`** : import depuis `lib/odoo/sync-log` fonctionne, signature inchangée
  (les tests existants de `odoo-sync.test.ts` restent verts).

### Risques / Hors-périmètre

- **Risque course webhook↔cron** : si le cron lit `alreadyHandled` _avant_ que le webhook ait commit son
  log (fenêtre de quelques ms), un double reste théoriquement possible. Mitigation acceptable :
  fréquence horaire du cron + latence webhook → collision quasi nulle ; pour une garantie dure, un index
  unique partiel `(entity_type, entity_id) where entity_type='cancellation'` serait nécessaire — **hors
  périmètre** (migration contrainte, ne respecte pas la règle « additive/safe » sans backfill préalable).
- **Volume `odoo_sync_logs`** : +1 ligne par move annulé côté webhook. Négligeable (annulations rares).
- **Hors-périmètre** : la logique métier d'annulation (création d'avoir, statut) reste manuelle
  (`sync.ts:826-829`) — ce chantier ne change que la **dédup de notification**, pas le traitement.
- **Invariant** : aucune notif n'altère une facture ; la dédup ne supprime aucune donnée (DELETE interdit
  sur factures sans objet ici).

---

## Synthèse — invariants & déploiement

| Chantier                | Migration | Effet DB factures                                               | Ordre déploiement |
| ----------------------- | --------- | --------------------------------------------------------------- | ----------------- |
| C1 idempotence analytic | non       | aucun (seul `facture_lignes.analytic_line_odoo_id`, déjà écrit) | standard, seul    |
| C2 pagination Eduvia    | non       | aucun (lecture API)                                             | standard, seul    |
| C3 chunking orphan      | non       | DELETE sur tables sources Eduvia uniquement                     | standard, seul    |
| C4 dédup notif          | non       | `notifications` + `odoo_sync_logs` uniquement                   | standard, seul    |

Aucun chantier ne crée, supprime ou mute `factures`/`facture_lignes` côté contenu ; numérotation gapless,
interdiction de DELETE facture, montants cents, immuabilité post-émission et `projet_id NOT NULL` sont
intacts. Aucun nouvel envoi Sentry (tout via `lib/utils/logger.ts`).
