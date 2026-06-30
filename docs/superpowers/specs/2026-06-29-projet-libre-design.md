# Design — Rattachement automatique des factures orphelines à un « projet libre » par client

Date : 2026-06-29
Statut : **design révisé après challenge** — le cœur (invariant DB + backfill + verrou) est prêt pour
plan. Le sous-composant analytique (§7) est **gelé** tant que la décision D-B2 (cardinalité du
code analytique Odoo) n'est pas tranchée.

> Révision : ce document remplace la v1. Les corrections proviennent d'une revue ligne-à-ligne du
> code (citations en annexe). Les écarts majeurs v1→v2 : objectif recadré (l'analytique n'était pas
> garantie), trigger de gel des factures (bloquait le backfill), borrow du code analytique retiré du
> chemin nominal, périmètre d'exclusion des pickers explicité, `taux_commission` 100→0.

## Objectif

**Objectif principal (garanti, livré) :** établir l'invariant **« aucune facture sans projet »**,
puis le verrouiller en base (`factures.projet_id NOT NULL`). Toute voie de création qui oublierait
le projet échoue alors bruyamment à l'insert plutôt que de produire une facture orpheline silencieuse.

**Objectif secondaire (best-effort, NON garanti par ce design) :** améliorer la couverture analytique
Odoo des factures aujourd'hui orphelines. Ce n'est _pas_ automatique (cf. §7 et D-B2) : le push
analytique dépend d'un `code_analytique` non-null, qui est rempli sur un sous-ensemble seulement des
projets. Rattacher un projet **ne suffit pas** à faire remonter une ligne analytique.

> Recadrage v1 : la v1 affirmait « toute facture remonte dans l'analytique Odoo ». C'est faux avec le
> mécanisme proposé — voir Contexte ci-dessous.

### Contexte (état actuel audité)

Trois chemins produisent des factures avec `projet_id = NULL`, la colonne étant nullable depuis
`20260522095000_realign_factures_libre_nullability.sql` (qui a aussi rendu nullable `mois_concerne`
et `facture_lignes.contrat_id`) :

- **Facture libre** — `lib/actions/factures/brouillon-libre.ts:300` passe `projetId: null` en dur.
- **Depuis devis** — `lib/actions/devis-to-facture.ts:141-156` n'écrit jamais `projet_id` (ni `mois_concerne`).
- **Avoir** — `lib/actions/factures/avoirs.ts:291` hérite de `origine.projet_id`.

Deux autres chemins d'insert existent et écrivent **toujours** un `projet_id` non-null (vérifié) :
`brouillon-echeancier.ts:177` (`group.projetId`) et `brouillon-from-events.ts:280` (`projetId`).
**Il y a donc 5 chemins d'insert au total** (cf. §3).

#### Faits analytiques (corrigent la motivation v1)

- Le push analytique (`lib/odoo/sync.ts:233-234`) est conditionné à `projet?.code_analytique`. La
  colonne est **éparse** par conception : _« seul un sous-ensemble des projets aura ce champ rempli »_
  (`20260526120000_projets_code_analytique.sql:18`). Beaucoup de projets ont `code_analytique = NULL`.
- Le compte Odoo est résolu **par `code`** (`lib/odoo/client.ts:778` : `[['code','=',code_analytique]]`),
  intention documentée _« ventile le CA par projet/société »_ (`client.ts:139`). Selon que vos codes
  sont **par client** ou **par projet**, « réutiliser le code d'un autre projet » est anodin ou
  **misimpute le CA** sur le P&L d'un projet sans rapport. → D-B2.
- **Les avoirs ne poussent AUCUNE ligne analytique.** `pushFactures` filtre `.eq('est_avoir', false)`
  (`sync.ts:75`) et est la seule fonction avec la boucle analytique ; `pushAvoirs`
  (`sync.ts:292-438`) pousse l'`out_refund` mais n'a pas de boucle analytique. Rattacher un projet à
  un avoir n'a donc **aucun bénéfice analytique** — uniquement la cohérence du futur `NOT NULL`.
- De plus, un **nouvel** avoir a toujours déjà un `projet_id` non-null : `createAvoir` exige une ligne
  rattachée à un contrat (`avoirs.ts:237-243`), or seules les factures échéancier/from-events (qui
  fixent `projet_id`) ont des lignes contrat. Les factures libres/devis (sans ligne contrat) ne
  peuvent jamais recevoir d'avoir. ⇒ « avoirs orphelins » = **uniquement de la donnée historique**,
  s'il en existe (cf. D-B3).

#### Fait bloquant pour le backfill (manqué en v1)

Le trigger `freeze_facture_after_emission` (`20260515120000_factures_integrity_guards.sql:69-71`)
rend **`projet_id` immuable après émission**. Or les factures orphelines à backfiller sont précisément
celles déjà émises. Un `UPDATE factures SET projet_id = … WHERE projet_id IS NULL` lève donc
`projet_id est immutable apres emission` sur chaque ligne. Le backfill doit traiter ce trigger (§5).

## Modèle

Un projet libre est un **vrai `projet`** (réutilise la génération de ref, la RLS, la jointure
analytique Odoo `sync.ts:69`), distingué par un nouveau flag `est_libre`, à raison d'**un par client**.
Réutiliser un vrai projet évite tout nouveau câblage Odoo/RLS/listings.

| Attribut du projet libre   | Valeur                              | Raison                                                       |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| `est_libre`                | `true`                              | nouveau flag, modèle d'`est_interne`                         |
| `client_id`                | le client                           | analytique/ventilation par client                            |
| `typologie_id`             | typologie `Libre` (code `LIB`)      | ref auto `0123-DUP-LIB` via `generate_projet_ref`            |
| `statut`                   | `'actif'`                           | comme les projets internes seedés                            |
| `cdp_id` / `backup_cdp_id` | `NULL`                              | conserve la visibilité admin-only (cf. §RLS)                 |
| `taux_commission`          | **`0`**                             | aligné `est_interne` ; « pas de partage » ⇒ 0, pas 100       |
| `code_analytique`          | **`NULL`** (pas de copie au create) | évite la misimputation ; résolution best-effort au push (§7) |

> Correction v1 : `taux_commission` passait à `100` (« pas de partage de commission ») — incohérent,
> 100 = commission maximale. Inerte aujourd'hui (les agrégats commission itèrent les **contrats** :
> `production.ts`, `dashboard/financials.ts`, `charts.ts` ; un projet libre n'a pas de contrat), mais
> `100` est une mine latente dès qu'un agrégat lira `projet.taux_commission` côté factures. → `0`.
> Correction v1 : le `code_analytique` n'est plus **copié** au create (borrow aveugle). Voir §7.

### Décisions tranchées

- **Granularité** : un projet libre par client.
- **Périmètre invariant** : factures libres + issues de devis + (backfill) toute facture `projet_id IS NULL`.
- **Verrou DB** : re-`NOT NULL` sur **`factures.projet_id` UNIQUEMENT** (pas `mois_concerne`, pas `facture_lignes.contrat_id`).
- **Visibilité** : factures libres restent admin-only (`cdp_id` du projet libre = NULL) — invariant RLS vérifié.
- **Listings/KPI/pickers** : projets libres masqués (liste explicite en §4).
- **`taux_commission`** : `0`.
- **`code_analytique` au create** : `NULL` (aucune copie).

### Décisions en attente (gèlent UNIQUEMENT le §7 optionnel)

- **D-B2 — Cardinalité du code analytique Odoo.** Vos `account.analytic.account.code` sont-ils
  **par client** (partagés entre les projets d'un client) ou **par projet** ? Détermine si une
  résolution best-effort du code pour une facture libre est correcte (per-client) ou misimpute le CA
  (per-project, alors §7 reste désactivé et l'analytique des factures libres est différée). **Le cœur
  (§1-6) ne dépend pas de cette réponse.**
- **D-B3 — Existe-t-il des orphelins historiques ?** Lancer sur prod :
  `SELECT statut, est_avoir, count(*) FROM factures WHERE projet_id IS NULL GROUP BY 1,2;`
  Calibre l'ampleur du backfill et confirme s'il existe des avoirs orphelins.
- **D-B4 — Gel du trigger.** Option A (retenue, conservatrice) : `DISABLE/ENABLE TRIGGER` autour du
  backfill, dans la transaction de migration. Option B (plus propre, **nécessite validation légale
  explicite**) : assouplir `freeze_facture_after_emission` pour autoriser la transition `NULL → X` de
  `projet_id` (un trou rempli n'est pas une mutation d'une valeur légale émise ; `projet_id` n'est ni
  sur le PDF ni dans le move Odoo). Par défaut on applique **A**.

## Composants

### 1. Migration schéma

- `ALTER TABLE projets ADD COLUMN est_libre BOOLEAN NOT NULL DEFAULT false;`
- `ALTER TABLE projets ADD CONSTRAINT chk_libre_interne_exclusifs CHECK (NOT (est_interne AND est_libre));`
- `CREATE UNIQUE INDEX uq_projet_libre_par_client ON projets (client_id) WHERE est_libre;`
  → un seul projet libre par client, et garde anti-concurrence (cf. ON CONFLICT du helper).
- Seed typologie `Libre` (code `LIB`, UUID fixe, `actif=true`), modèle du seed `INT`
  (`20260428103623_projets_internes.sql:44-51`), `ON CONFLICT (id) DO NOTHING`.
- Fonction `get_or_create_projet_libre(p_client_id uuid) RETURNS uuid` — **source unique** de la
  logique find-or-create, partagée par le runtime (RPC) et le backfill :

```sql
CREATE OR REPLACE FUNCTION get_or_create_projet_libre(p_client_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER                       -- l'INSERT reste soumis à RLS projets_admin_insert
SET search_path = public, pg_temp
AS $$
DECLARE
  v_projet_id   uuid;
  v_typologie   uuid;
BEGIN
  -- Find : prédicat IDENTIQUE à l'index unique (WHERE est_libre, SANS filtre archive — cf. C1).
  SELECT id INTO v_projet_id
  FROM projets WHERE client_id = p_client_id AND est_libre LIMIT 1;
  IF FOUND THEN RETURN v_projet_id; END IF;

  SELECT id INTO v_typologie FROM typologies_projet WHERE code = 'LIB';

  INSERT INTO projets (client_id, typologie_id, est_libre, statut, archive, taux_commission, cdp_id)
  VALUES (p_client_id, v_typologie, true, 'actif', false, 0, NULL)
  ON CONFLICT (client_id) WHERE est_libre DO NOTHING   -- inférence d'index partiel
  RETURNING id INTO v_projet_id;

  IF v_projet_id IS NULL THEN          -- course concurrente perdue : l'autre insert a gagné
    SELECT id INTO v_projet_id
    FROM projets WHERE client_id = p_client_id AND est_libre LIMIT 1;
  END IF;
  RETURN v_projet_id;
END;
$$;
```

> `SECURITY INVOKER` (et non DEFINER) : un appel RPC direct par un non-admin échoue à l'INSERT via la
> RLS `projets_admin_insert = is_admin()` (`20260511170608_…:35`). Pas d'escalade de privilège.
> Le backfill (contexte owner de migration) contourne la RLS normalement.

### 2. Helper runtime `getOrCreateProjetLibre(clientId)`

Nouveau `lib/projets/projet-libre.ts` : fin wrapper RPC, **pas** de réimplémentation de la logique.

```ts
export async function getOrCreateProjetLibre(
  supabase: SupabaseServerClient,
  clientId: string,
): Promise<{ ok: true; projetId: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('get_or_create_projet_libre', {
    p_client_id: clientId,
  });
  if (error || !data)
    return { ok: false, error: error?.message ?? 'projet libre indisponible' };
  return { ok: true, projetId: data as string };
}
```

Concurrence/idempotence : garanties **en base** par l'index unique partiel + `ON CONFLICT … re-SELECT`
(atomique côté serveur, pas de course multi-aller-retour JS comme en v1).

### 3. Branchement des chemins de création (les 5 énumérés)

| #   | Chemin        | Fichier:ligne                  | `projet_id` aujourd'hui     | Changement                                          |
| --- | ------------- | ------------------------------ | --------------------------- | --------------------------------------------------- |
| 1   | Facture libre | `brouillon-libre.ts:300`       | `null`                      | → `getOrCreateProjetLibre(supabase, clientId)`      |
| 2   | Depuis devis  | `devis-to-facture.ts:141-156`  | absent (null)               | ajoute `projet_id` = libre du `devis.client_id`     |
| 3   | Avoir         | `avoirs.ts:291`                | hérite origine              | **inchangé** (origine désormais toujours rattachée) |
| 4   | Échéancier    | `brouillon-echeancier.ts:177`  | `group.projetId` (non-null) | **inchangé** (vérifié non-null)                     |
| 5   | From-events   | `brouillon-from-events.ts:280` | `projetId` (non-null)       | **inchangé** (vérifié non-null)                     |

Les chemins 1-2 sont admin-only (`checkAuth` impose admin `guards.ts:104` ; devis `isAdmin`
`devis-to-facture.ts:40`) ⇒ la RLS `projets_admin_insert` sur l'INSERT du projet libre est satisfaite.
En cas d'échec du helper (client introuvable/archivé), remonter l'erreur **avant** d'insérer la
facture (cohérent avec la garde existante `brouillon-libre.ts:292-295`).

### 4. Exclusion listings / pickers / KPI (liste explicite — corrige le hand-wave v1)

Les sites de filtre `est_interne` existants sont centrés **saisies de temps / portefeuille CDP** : ce
ne sont **pas** les mêmes que ceux requis pour `est_libre`. À traiter, par fichier :

- **Picker « Nouvelle facture » (FUITE confirmée)** — `lib/queries/factures.ts:171-181`
  (`listProjetsForFacturation`) ne filtre que `archive=false` ⇒ le projet libre apparaîtrait dans le
  sélecteur de projet. Ajouter `.eq('est_libre', false)` (et idéalement `.eq('est_interne', false)`).
- **Table projets** — `components/projets/projets-data-table.tsx:123` filtre `!p.est_interne` ⇒
  ajouter `&& !p.est_libre` ; ajuster aussi le `internesCount`/compteur si pertinent.
- **Liste projets admin** — `lib/queries/projets.ts` (les fonctions de listing/agrégat projet) :
  ajouter `est_libre = false` là où l'on liste/compte des projets clients.
- **Naturellement sûr (aucune action)** — `listBillableProjets`
  (`lib/queries/billable-events/queries.ts:188-189`) exige `contrats.length > 0` ; un projet libre n'a
  pas de contrat. Les agrégats commission/production itèrent les contrats (idem).
- **Création de projet** — `components/projets/projet-create-dialog.tsx:118` exclut déjà `ABS` par
  code ; étendre : `t.code !== 'ABS' && t.code !== 'LIB'` (même pattern).

### 5. Migration backfill (data) + gestion du trigger de gel

Set-based, idempotent, **réutilise la fonction** (source unique) :

```sql
-- 5a. Un projet libre par client orphelin (idempotent via la fonction)
SELECT get_or_create_projet_libre(c.client_id)
FROM (SELECT DISTINCT client_id FROM factures WHERE projet_id IS NULL) c;

-- 5b. Affectation. Le trigger de gel interdit projet_id post-émission (D-B4) :
--     Option A (par défaut) — neutralisation locale, transactionnelle, justifiée (remplissage d'un
--     trou NULL, projet_id absent du PDF et du move Odoo).
ALTER TABLE factures DISABLE TRIGGER trg_factures_freeze_after_emission;

UPDATE factures f
SET projet_id = p.id
FROM projets p
WHERE f.projet_id IS NULL AND p.client_id = f.client_id AND p.est_libre;

ALTER TABLE factures ENABLE TRIGGER trg_factures_freeze_after_emission;
```

- Couvre libre + devis + tout avoir orphelin historique (D-B3) sans chemin spécifique.
- Odoo-safe : les factures déjà poussées ont `odoo_id` non-null ⇒ hors `pushFactures` (filtre
  `.is('odoo_id', null)`) ; et le push analytique est idempotent (`analytic_line_odoo_id`).
- Si **D-B4 = Option B** est validée, remplacer 5b par l'UPDATE direct (sans DISABLE/ENABLE) après
  avoir assoupli le trigger (`AND OLD.projet_id IS NOT NULL` sur le check `projet_id`).

### 6. Verrou final (`projet_id` UNIQUEMENT)

```sql
-- Pré-check : doit renvoyer 0, sinon le backfill est incomplet.
-- SELECT count(*) FROM factures WHERE projet_id IS NULL;
ALTER TABLE factures ALTER COLUMN projet_id SET NOT NULL;
```

- **Ne PAS** re-`NOT NULL` `mois_concerne` (NULL sur les factures issues de devis,
  `devis-to-facture.ts` ne l'écrit pas) ni `facture_lignes.contrat_id` (NULL sur lignes libres/devis).
  La v1 disait « annule la migration 20260522095000 » : faux, c'est un re-verrou **partiel** voulu.
- Doit s'exécuter **après** que les 5 chemins fixent `projet_id` (déploiement code + migration dans la
  même release ; le verrou dans la migration de backfill, après le pré-check).
- **Ops (grande table)** : `SET NOT NULL` prend un `ACCESS EXCLUSIVE` + scan de validation. Si
  `factures` est volumineuse, préférer `ADD CONSTRAINT chk_projet_id_nn CHECK (projet_id IS NOT NULL)
NOT VALID` → `VALIDATE CONSTRAINT` (lock court) → `SET NOT NULL` → drop du CHECK.

### 7. (Optionnel, GELÉ sur D-B2) Couverture analytique best-effort au push

**Ne fait PAS partie du livrable cœur.** À activer seulement si D-B2 = codes **par client**. Plutôt
qu'un snapshot au create (périme, et inerte si le client n'a aucun code), résoudre au **push** dans
`sync.ts` : `code = projet.code_analytique ?? <code du projet le plus récent du même client ayant un
code, ORDER BY created_at DESC>`. Reste best-effort (NULL si le client n'a aucun code nulle part).
Si D-B2 = codes **par projet** : §7 **abandonné** (un compte analytique par client serait nécessaire,
hors périmètre) ; les factures libres restent sans ligne analytique, conformément à l'objectif recadré.

## Flux de données

```
createFreeBrouillon(clientId, lignes)
  └─ getOrCreateProjetLibre(supabase, clientId)  ──(RPC, idempotent)──> projet_id (non-null)
       └─ insertBrouillonWithLignes({ projetId, ... })
            └─ facture.projet_id renseigné
                 └─ (à l'émission) sync Odoo pushFactures :
                      code_analytique présent ? ── oui ──> push account.analytic.line
                                               └─ non  ──> pas de ligne analytique (best-effort)
```

## Gestion d'erreurs

- Helper en échec (client introuvable/archivé, ou non-admin via RPC direct → RLS) → erreur remontée,
  facture non créée.
- Concurrence (2 factures libres simultanées même client) → l'index unique partiel rejette le 2e
  INSERT ; `ON CONFLICT … re-SELECT` renvoie l'existant. **Atomique en base.**
- **Alignement archive (corrige C1 v1)** : find et index utilisent le **même** prédicat (`est_libre`,
  sans `archive`). Si un projet libre archivé existait, un find filtrant `archive=false` (v1) l'aurait
  manqué puis aurait bouclé sur la violation d'unicité. Ici, pas de filtre `archive` au find.
- Backfill : transactionnel, idempotent (find-or-create + `WHERE projet_id IS NULL`), trigger de gel
  rétabli même en cas d'échec (DDL transactionnel).

## Tests

- `get_or_create_projet_libre` : crée si absent ; réutilise si présent ; idempotent (2 appels → 1 ligne).
- **RLS visibilité (sécurité — manquait en v1)** : un user CDP **ne voit pas** une facture libre après
  rattachement (projet libre `cdp_id=NULL` ⇒ `factures_select` EXISTS vide ⇒ admin-only). Vérifié
  conceptuellement (`20260615130000_…:71-73`), à figer en test.
- `createFreeBrouillon` / `createFactureFromDevis` : facture résultante `projet_id` non-null vers un
  projet `est_libre=true` du bon client.
- **Régression des 5 chemins d'insert** : chacun insère toujours (échéancier, from-events, avoir
  inclus) après le verrou `NOT NULL`.
- **Backfill sur facture émise** : l'UPDATE réussit malgré le trigger de gel (valide la stratégie D-B4).
- Garde `NOT NULL` : insert de facture sans `projet_id` échoue.
- Backfill : `count(*) WHERE projet_id IS NULL = 0` après exécution.
- `est_libre` exclu de `listProjetsForFacturation` et de la table projets ; `listBillableProjets`
  reste vide pour un projet libre.

## Hors périmètre

- Création d'un compte analytique Odoo par client (dépend de D-B2 ; voir §7).
- Snapshot/copie du `code_analytique` au create (retiré : misimputation + péremption).
- Visibilité CDP des factures libres (restent admin-only).
- **Adjacent, non traité (à tracker)** : une facture libre **émise** ne peut pas être créditée —
  `createAvoir` exige une ligne contrat (`avoirs.ts:237-243`). Indépendant de ce design.

## Annexe — vérifications code (pour l'implémenteur)

| Affirmation                                       | Preuve                                                                                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 5 chemins d'insert factures                       | `devis-to-facture.ts:140`, `avoirs.ts:288`, `brouillon-echeancier.ts:174`, `brouillon-from-events.ts:277`, `brouillon-libre.ts:117` |
| `code_analytique` éparse, lookup par `code`       | `20260526120000_…:18`, `lib/odoo/client.ts:778`                                                                                     |
| Avoirs sans push analytique                       | `sync.ts:75` (`est_avoir=false`), `pushAvoirs` 292-438 (pas de boucle)                                                              |
| Nouvel avoir → projet non-null                    | `avoirs.ts:237-243` (exige ligne contrat)                                                                                           |
| Trigger gèle `projet_id` post-émission            | `20260515120000_…:69-71`                                                                                                            |
| RLS facture admin-only conservée                  | `factures_select` `20260615130000_…:71-73` ; `cdp_id=NULL` ⇒ EXISTS vide                                                            |
| RLS projet : pas de clause `est_libre` nécessaire | `projets_select` `20260615130000_…:108-109` (admin/cdp/interne uniquement)                                                          |
| INSERT projet admin-only                          | `projets_admin_insert` `20260511170608_…:35` ; appelants admin                                                                      |
| Agrégats commission/prod itèrent contrats         | `production.ts`, `dashboard/financials.ts`, `dashboard/charts.ts`                                                                   |
| Pattern de masquage typologie                     | `projet-create-dialog.tsx:118` (`ABS`)                                                                                              |
| `est_interne` précédent (flag, taux 0, ref)       | `20260428103623_projets_internes.sql`                                                                                               |
