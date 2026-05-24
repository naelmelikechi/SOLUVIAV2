# Spec - Filtre OPCO sur brouillon de facturation

- Date : 2026-05-24
- Auteur : Nael Melikechi + brainstorming Claude
- Statut : valide, prêt à plan
- Phasage : monolithique (1 phase)

## 1. Contexte et problème

Soluvia génère chaque mois un brouillon de facture par client CFA, listant les contrats à commissionner. Le filtre actuel (`lib/queries/billable-events.ts:316`) sélectionne tous les contrats `ENGAGE` avec step 1 OPCO émis et `contract_number` (DECA) renseigné, **sans aucune distinction d'OPCO**.

Cas concret déclencheur (2026-05-13) : Elena GRAND (CTR-02066, DECA `006202605000098`) a été incluse dans le brouillon HEOL. HEOL commissionne plusieurs OPCO (AKTO principalement, mais aussi d'autres) et selon le moment du mois veut émettre des factures séparées par OPCO, en fonction des bordereaux reçus. Aujourd'hui c'est tout ou rien. L'admin doit retirer les lignes à la main et se souvenir mentalement de quels préfixes DECA correspondent à quel OPCO.

État réel en prod (35 contrats avec DECA, vérifié 2026-05-24) :

| Préfixe | Contrats | OPCO probable         |
| ------- | -------- | --------------------- |
| 079     | 12       | AKTO                  |
| 089     | 8        | AKTO                  |
| 017     | 8        | AKTO                  |
| 050     | 3        | AKTO                  |
| 030     | 1        | AKTO                  |
| 033     | 1        | AKTO                  |
| 006     | 1        | inconnu (Elena GRAND) |
| 076     | 1        | inconnu               |

Format DECA observé : 15 caractères, préfixe constant 3 chiffres = identifiant agence OPCO attribué par France Compétences.

## 2. Objectifs

1. Identifier l'OPCO de chaque contrat via le préfixe (3 caractères) du `contract_number` (DECA).
2. Permettre à l'admin de **choisir 1 ou plusieurs OPCO** au moment de la génération du brouillon (multi-sélection libre).
3. Bloquer les contrats dont le préfixe DECA n'est mappé à aucun OPCO connu (nouveau `lock_reason: 'unknown_opco'`), pour forcer la résolution avant facturation.
4. Référentiel global OPCO administrable depuis `/admin/parametres` (CRUD codes, noms, préfixes DECA).
5. Préserver l'affichage et la traçabilité : chaque ligne de brouillon montre son OPCO, le PDF facture groupe les lignes par OPCO avec sous-totaux.

Non-objectifs :

- Configuration OPCO par client (modèle global, mutualisé entre HEOL, HEOL ACADEMY, futurs CFA).
- API Eduvia : pas de tentative d'enrichissement OPCO côté Eduvia (l'API ne l'expose pas).
- Détection automatique de l'OPCO par un autre canal que le préfixe DECA.
- Migration des factures déjà émises (rétroactif non requis, historique inchangé).
- Renommage / migration de `lock_reason: 'missing_deca'` (reste tel quel, complémentaire).

## 3. Vocabulaire

- **OPCO** : opérateur de compétences (AKTO, OPCO Mobilités, OPCO 2i, etc.) qui finance les contrats d'apprentissage et de professionnalisation.
- **DECA** : Dépôt des Contrats d'Apprentissage, identifiant unique du contrat dans le système France Compétences. Stocké dans `contrats.contract_number`. Format 15 caractères, les 3 premiers identifient l'agence OPCO.
- **Préfixe DECA** : les 3 premiers caractères du `contract_number` (ex : `017`, `006`).
- **OPCO résolu** : OPCO identifié à partir du préfixe via le mapping `opcos.prefixes_deca`.
- **OPCO inconnu** : préfixe DECA présent mais absent du mapping → contrat bloqué jusqu'à résolution admin.

## 4. Schéma de données

### 4.1 Nouvelle table `opcos`

```sql
create table opcos (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,           -- 'AKTO', 'OPCO_MOBILITES', etc.
  nom             text not null,                  -- 'AKTO - Commerce & Services'
  prefixes_deca   text[] not null default '{}',  -- ['017','030','033','050','079','089']
  actif           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index opcos_prefixes_deca_gin on opcos using gin (prefixes_deca);
create unique index opcos_code_active on opcos (code) where actif;
```

**Contraintes** :

- `code` unique global (slug ASCII en majuscules, validé en UI).
- `prefixes_deca` : array de chaînes de 3 caractères. CHECK que chaque préfixe est `^[0-9]{3}$`.
- Pas d'unicité sur les éléments du array entre lignes : on doit garantir qu'un même préfixe n'est pas mappé à deux OPCO actifs simultanément (validation côté action, voir 5.3).

**RLS** :

- SELECT pour tous les authentifiés (la résolution OPCO se fait côté serveur dans toutes les queries de billable-events).
- INSERT / UPDATE / DELETE admin et superadmin uniquement (cohérent avec [[feedback-rls-admin-roles]]).

**Seed initial** (migration) : AKTO avec ses 6 préfixes confirmés `['017','030','033','050','079','089']`. Pas de seed pour les préfixes 006 et 076 : ils apparaîtront en `unknown_opco` jusqu'à mapping admin (forçant la décision).

### 4.2 Pas de modification de `contrats`

L'OPCO est **résolu à la volée** (jointure par préfixe), pas stocké sur `contrats`. Justification :

- Pas de duplication d'information (le DECA contient déjà l'OPCO implicitement).
- Si le mapping change (correction d'erreur, ajout d'un préfixe), tous les contrats récupèrent automatiquement la nouvelle résolution sans backfill.
- Pas de trigger à maintenir sur les sync Eduvia.

Trade-off accepté : si un préfixe DECA est ambigu (un jour deux OPCO partagent un préfixe — improbable mais possible), il faudra arbitrer manuellement. Pas un cas connu aujourd'hui.

## 5. Logique métier

### 5.1 Résolution OPCO dans `getBillableEventsForProjet`

Étendre `BillableEvent` avec deux nouveaux champs :

```ts
opco_code: string | null; // 'AKTO', null si non résolu
opco_nom: string | null; // 'AKTO - Commerce & Services', null si non résolu
```

Étendre le type `lock_reason` :

```ts
type LockReason =
  | 'opposite_billed'
  | 'missing_deca'
  | 'unknown_line_type'
  | 'unknown_opco'; // NEW
```

Algorithme :

1. Charger tous les OPCO actifs au début de `getBillableEventsForProjet` (1 SELECT, ~10 lignes).
2. Construire `prefixToOpco: Map<string, { code, nom }>` (un préfixe = un OPCO ; collision = warning + premier match).
3. Pour chaque contrat : extraire `LEFT(contract_number, 3)`, regarder dans le map.
4. Si trouvé → renseigner `opco_code` + `opco_nom`.
5. Si pas trouvé (mais DECA présent et bien formé) → `opco_code = null`, statut `locked`, `lock_reason = 'unknown_opco'`.

**Priorité des `lock_reason`** (ordre décroissant, le premier qui matche gagne) :

1. `missing_deca` (pas de contract_number)
2. `unknown_opco` (DECA présent mais préfixe non mappé)
3. `unknown_line_type` (line_type Eduvia inconnu)
4. `opposite_billed` (engagement et opco_step se verrouillent mutuellement)

Justification : `missing_deca` et `unknown_opco` sont des verrous de configuration (rien à facturer tant que pas résolu), `unknown_line_type` et `opposite_billed` sont des verrous métier (facture en cours ou ambiguïté de classification).

### 5.2 Filtre OPCO au moment du brouillon

Étendre la signature de `createFactureFromEvents` (ou la fonction équivalente qui crée le brouillon) avec un paramètre optionnel :

```ts
interface CreateBrouillonOptions {
  // ... existant
  opcoCodesFilter?: string[]; // ['AKTO'] = inclure AKTO seul. undefined = pas de filtre (tous OPCO résolus).
}
```

Comportement :

- Si `opcoCodesFilter` fourni : on inclut uniquement les events dont `opco_code IN opcoCodesFilter`.
- Si `undefined` : on inclut tous les events `available` avec `opco_code != null` (les `unknown_opco` étant déjà `locked`, ils sont exclus naturellement).
- Cas particulier : `opcoCodesFilter = []` → erreur de validation Zod (au moins un OPCO requis si on précise le filtre).

### 5.3 CRUD admin référentiel OPCO

Action `createOpco({ code, nom, prefixesDeca })` :

- Valide `code` (slug majuscule), `nom` (non vide), chaque préfixe (`^[0-9]{3}$`).
- Vérifie qu'aucun préfixe n'est déjà mappé à un autre OPCO actif (SELECT par `prefixes_deca && ARRAY[...]`).
- Audit log : `opco_created`.

Action `updateOpco(id, { ... })` : même validation, vérifie collision en excluant l'OPCO courant.

Action `archiveOpco(id)` : `actif = false`. Si des contrats avec ce préfixe existent, warning UI (mais autorise l'archive). Les events deviennent `unknown_opco`.

Action `unarchiveOpco(id)` : `actif = true`. Re-valide qu'aucun préfixe n'a été pris par un autre OPCO entre-temps.

## 6. UI

### 6.1 Page admin `/admin/parametres/opcos`

Pattern existant cf `/admin/parametres/societes-emettrices` (livré PR #6 Phase 1 devis).

Layout :

- Table : code, nom, préfixes DECA (badges), actif (toggle), actions (éditer, archiver).
- Bouton "Nouvel OPCO" → dialog avec champs `code`, `nom`, `prefixes_deca` (input tags ou textarea CSV).
- Filtre actif / archivé via tabs.

Validation côté client : préfixes au format `[0-9]{3}` séparés par virgule ou retour à la ligne, dédupliqués avant submit.

Affichage : sur chaque ligne, lien "Voir contrats associés" qui ouvre une modal listant les contrats actifs dont le préfixe matche (utile pour la migration initiale).

### 6.2 Dialog brouillon

Composant existant à étendre : trouver dans `components/facturation/` le dialog qui appelle `createFactureFromEvents` (probablement `new-facture-dialog.tsx` ou similaire — à vérifier dans le plan).

Ajout d'une section "OPCO à inclure" :

- Multi-select des OPCO **détectés dans les events available** (pas tous les OPCO actifs, juste ceux présents). Si HEOL n'a que des contrats AKTO ce mois-ci, seul AKTO est proposé.
- Compteur de lignes par OPCO : "AKTO (32)", "OPCO Mobilités (2)".
- Par défaut : tous cochés.
- Si l'admin décoche tout : bouton "Créer le brouillon" désactivé, message "Sélectionnez au moins un OPCO".

Affichage des events bloqués `unknown_opco` : badge orange "OPCO inconnu (préfixe XXX)" + tooltip "Mappez ce préfixe dans `/admin/parametres/opcos` pour l'inclure". Pas cochable.

### 6.3 PDF facture

Modifier `components/facturation/facture-pdf.tsx` :

- Grouper les lignes par OPCO (`opco_code` stocké sur la facture_ligne, voir 5.4).
- Sous-titre par groupe : "OPCO : AKTO" (gras, 10pt).
- Sous-total HT par groupe (à droite).
- Total HT général en bas inchangé.
- Si tous les lignes ont le même OPCO : pas de regroupement (1 seul bloc), juste mention "OPCO : XXX" en en-tête.

### 5.4 Persistance `opco_code` sur les lignes de facture

Ajouter colonne `facture_lignes.opco_code TEXT NULL`. Renseignée au moment de la création de la ligne via `createFactureFromEvents`. Permet :

- Affichage groupé dans le PDF sans rejointure à la volée.
- Analytics futures (commission par OPCO, par mois).
- Robustesse : même si le préfixe DECA est re-mappé après émission, la facture garde la trace de l'OPCO d'origine.

Index `facture_lignes_opco_code_idx` pour les futures queries analytiques.

## 7. Tests

### 7.1 pgTAP

Nouveau fichier `supabase/tests/11_opcos_rls_resolution.sql` :

- RLS SELECT autorisée pour authentifiés, INSERT/UPDATE/DELETE bloqués pour CDP.
- CHECK constraint sur le format des préfixes (rejet `^[0-9]{3}$` strict).
- Cohérence : un préfixe ne peut pas être dans deux OPCO actifs simultanément (testé via insert manuel, attendu : la 2e insertion réussit mais la validation côté action doit bloquer ; le test pgTAP documente ce comportement).

### 7.2 Vitest unit

Nouveau fichier `__tests__/opco-resolution.test.ts` (~10 tests) :

- `resolveOpcoFromDeca('017202605001222', mapping)` → `{ code: 'AKTO', nom: '...' }`
- DECA inconnu (`006...`) → `null`
- DECA absent → `null`
- DECA mal formé (moins de 3 chars) → `null`
- Mapping vide → tous null
- Préfixe en doublon dans deux OPCO (configuration invalide) → premier match wins + log warning

Étendre `__tests__/billable-events.test.ts` (~5 tests nouveaux) :

- Contrat AKTO mappé → event avec `opco_code: 'AKTO'`, statut `available`
- Contrat préfixe non mappé → event `locked`, `lock_reason: 'unknown_opco'`
- Priorité `missing_deca` > `unknown_opco` (DECA vide ne devient pas `unknown_opco`)
- Plusieurs OPCO sur même projet → events séparés avec opco_code différents
- Filtre `opcoCodesFilter = ['AKTO']` → seuls les events AKTO sont incluis dans le brouillon

Nouveau fichier `__tests__/create-brouillon-opco-filter.test.ts` (~5 tests) :

- Filtre AKTO seul : 1 OPCO inclus, autres exclus
- Filtre multi (AKTO + OPCO Mobilités) : 2 OPCO inclus
- Pas de filtre : tous OPCO résolus inclus, `unknown_opco` exclus
- Filtre vide `[]` : Zod refuse
- Filtre avec code OPCO inexistant : Zod refuse (référence non résolue)

Nouveau fichier `__tests__/opcos-actions.test.ts` (~6 tests) :

- `createOpco` succès cas nominal
- Collision préfixe avec OPCO actif existant → refus
- Collision avec OPCO archivé → autorisé
- `updateOpco` : retrait d'un préfixe utilisé par contrats actifs → autorisé avec warning
- `archiveOpco` : marque actif=false, n'efface pas les préfixes
- Non-admin → refus

## 8. Phasage et points de coordination

**Une seule phase** (taille équivalente Phase 1 devis). Décomposition en tasks :

1. Migration table `opcos` + seed AKTO + colonne `facture_lignes.opco_code`.
2. Helper pur `resolveOpcoFromDeca()` + tests TDD.
3. Query `getActiveOpcoMapping()` + cache mémo session.
4. Extension `BillableEvent` + résolution dans `getBillableEventsForProjet` + tests.
5. Extension `createFactureFromEvents` avec `opcoCodesFilter` + persistance `opco_code` sur lignes + tests.
6. Actions admin `createOpco` / `updateOpco` / `archiveOpco` + tests.
7. Page admin `/admin/parametres/opcos` + dialog + table.
8. Dialog brouillon : multi-select OPCO + compteur + désactivation.
9. PDF facture : groupement par OPCO + sous-totaux.
10. Tests pgTAP RLS + intégration.

Pas de dépendance externe. Pas de coordination avec la session devis Phase 2 (zones de code disjointes : devis = nouveau workflow, OPCO = enrichissement du flux facture existant).

## 9. Migration et déploiement

- Migration 1 : `create table opcos` + seed AKTO + index.
- Migration 2 : `alter table facture_lignes add column opco_code` + index.
- Backfill : `UPDATE facture_lignes SET opco_code = ...` via jointure préfixe sur les factures déjà émises (optionnel, non bloquant — les nouvelles factures auront le champ rempli).
- Pas de breaking change sur l'API publique de `BillableEvent` (champs ajoutés, pas modifiés).
- Pas de feature flag : déploiement direct, l'absence de mapping est gérée par `unknown_opco`.

## 10. Risques et mitigations

| Risque                                                              | Impact                                                                                       | Mitigation                                                                                                                                                 |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mapping OPCO incomplet au déploiement                               | Contrats `006` et `076` bloqués en `unknown_opco`, brouillon HEOL ne propose plus ces lignes | Acceptable : c'est exactement le comportement voulu. Avant déploiement, demander à l'utilisateur de mapper 006 et 076 via UI admin (ou via SQL si urgent). |
| Collision préfixe entre OPCO (préfixe partagé)                      | Résolution ambiguë                                                                           | Validation côté action refuse la collision sur OPCO actifs. Si déjà en DB, premier match + warning logger.                                                 |
| Reformat France Compétences du DECA (longueur ou structure change)  | Préfixe sur 3 chars ne marche plus                                                           | Externaliser dans `lib/opco/resolve.ts` la fonction `extractDecaPrefix(deca): string`, qui pourra être adaptée. Aujourd'hui = `LEFT(deca, 3)`.             |
| L'utilisateur oublie de mapper un OPCO et émet un brouillon partiel | Lignes manquantes dans la facture du mois                                                    | Dialog brouillon affiche compteur `unknown_opco`. Si > 0 et l'utilisateur valide quand même, modal de confirmation avec liste des préfixes non mappés.     |

## 11. Métriques de succès

- 0 ligne facturée à tort à un mauvais OPCO post-déploiement (vs 1 par mois en moyenne actuellement).
- Temps de génération du brouillon HEOL ≤ +200ms (1 SELECT supplémentaire + résolution Map).
- 100% des contrats avec DECA en prod sont résolus après mapping initial.

## 12. Liens

- [[project-todos-open]] - dette OPCO listée dans les TODOs ouverts 2026-05-24.
- [[project-deca-rule-billing]] - règle existante "pas de contract_number = émission bloquée", complète `missing_deca`.
- [[project-commission-base]] - base PEDAGOGIE step 1 OPCO, le filtre OPCO s'applique au-dessus.
- [[feedback-rls-admin-roles]] - `get_user_role() IN ('admin','superadmin')` pour RLS WRITE.
- [[feedback-verify-audits]] - vérifier les claims d'audit avant de planifier (vérification du format DECA faite en SQL prod 2026-05-24).
