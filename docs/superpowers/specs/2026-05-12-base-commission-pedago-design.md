# Spec : base de commission HEOL sur lignes pédagogiques

**Date** : 2026-05-12 (réécrit après découverte de l'endpoint `/api/v1/invoices/:id/lines`)
**Statut** : design validé, en attente review du spec écrit
**Auteur** : Nael Melikechi (via Claude)
**Chantier lié, hors scope** : factures libres (à brainstormer séparément, voir mémoire `project_facture_libre_todo`)

## Problème

Aujourd'hui, la base de commission HEOL inclut des frais de premier équipement (500€ "Ordinateur portable") qui ne devraient pas être commissionnés. Le code (`lib/queries/billable-events.ts:154-169`) somme `eduvia_invoice_steps.total_amount` sur tous les step 1 émis, sans distinguer ce qui est pédagogique de ce qui ne l'est pas.

**Impact mesuré sur HEOL** (sur la base d'un taux historique de 50% TTC) : 6 invoices "matériel pur" de 500€ = 3 000€ inclus à tort dans `eduvia_invoice_steps.total_amount`, soit **1 500€ TTC overfacturé** sur FAC-HED-0003 (émise 2026-05-11, statut `emise`). À noter : 7 lignes matériel supplémentaires (3 500€) sont en plus noyées dans des invoices "pédago", invisibles aujourd'hui en DB Soluvia (cf. "Architecture cible" pour le fix). Le total matériel réel HEOL est de **6 500€** (13 lignes × 500€).

En plus du nettoyage de base, le **taux de commission Soluvia** HEOL passe de **50% à 40% TTC**. Ce taux s'applique sur les frais pédagogiques que le CFA a facturé à l'OPCO (lignes `PEDAGOGIE` des bordereaux Eduvia). Aucune commission n'est jamais prise sur le matériel informatique / premier équipement (lignes `PREMIEREQUIPEMENT`).

## Découverte clé

L'endpoint **non documenté** `GET /api/v1/invoices/:id/lines` expose le détail ligne par ligne d'un bordereau OPCO. Chaque ligne porte un champ `line_type` typé :

```json
{
  "id": 80,
  "invoice_id": 62,
  "amount": 500,
  "line_type": "PREMIEREQUIPEMENT",
  "quantity": 1,
  "description": "Premier équipement pédagogique : Ordinateur portable"
}
```

Deux `line_type` observés sur les data HEOL actuelles :

| line_type           | Description Eduvia                                     | Liste Soluvia                       |
| ------------------- | ------------------------------------------------------ | ----------------------------------- |
| `PEDAGOGIE`         | "Échéance n°X - Frais pédagogiques"                    | **Whitelist** (commissionné)        |
| `PREMIEREQUIPEMENT` | "Premier équipement pédagogique : Ordinateur portable" | **Blacklist** (jamais commissionné) |

D'autres `line_type` existent probablement (RQTH, MOBILITY, INSCRIPTION, EXAMEN…) mais ne sont pas observés sur HEOL aujourd'hui. **Tout `line_type` qui n'est ni whitelisté ni blacklisté est traité comme "inconnu" : le contrat correspondant est verrouillé (`locked`, `lock_reason='unknown_line_type'`) jusqu'à décision humaine** (cf. "Circuit breaker").

### Divergence connue : arrondi Eduvia avant fix de mai 2026

Sur les 6 premiers invoices HEOL émis (IDs 4-9, émis entre 2026-03-05 et 2026-04-13), les lignes API `PEDAGOGIE` sont arrondies à l'euro entier alors que `step.including_pedagogie_amount` conserve les centimes. Écart cumulé : **3,16€** (soit 1,27€ TTC de commission à 40%). À partir de 2026-05-06, Eduvia a corrigé ce comportement et l'écart est strictement 0. Décision : **on prend les lignes API comme source de vérité** (ce qui figure réellement sur le bordereau OPCO PDF reçu par HEOL).

## Architecture cible

### Nouvelle table `eduvia_invoice_lines`

```sql
CREATE TABLE eduvia_invoice_lines (
  id            BIGINT PRIMARY KEY,           -- id Eduvia, pas un UUID
  invoice_id    BIGINT NOT NULL,              -- FK logique vers eduvia_invoice_steps.invoice_id
  contrat_id    UUID NOT NULL REFERENCES contrats(id) ON DELETE CASCADE,
  amount        NUMERIC(12,2) NOT NULL,
  line_type     TEXT NOT NULL,                -- 'PEDAGOGIE', 'PREMIEREQUIPEMENT', ...
  quantity      INTEGER NOT NULL DEFAULT 1,
  description   TEXT,
  created_at    TIMESTAMPTZ,                  -- timestamp Eduvia
  updated_at    TIMESTAMPTZ,                  -- timestamp Eduvia
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_eduvia_invoice_lines_contrat ON eduvia_invoice_lines (contrat_id);
CREATE INDEX ix_eduvia_invoice_lines_invoice ON eduvia_invoice_lines (invoice_id);
CREATE INDEX ix_eduvia_invoice_lines_type ON eduvia_invoice_lines (line_type);

-- RLS : lecture admin+CDP scopés sur leurs projets (via contrat_id → projet → cdp_id)
ALTER TABLE eduvia_invoice_lines ENABLE ROW LEVEL SECURITY;
```

`invoice_id` n'est pas une FK formelle vers `eduvia_invoice_steps` parce qu'un même `invoice_id` Eduvia peut couvrir plusieurs steps logiques (peu probable, mais Eduvia ne le contredit pas). Le rattachement utile est sur `contrat_id`.

### Sync Eduvia étendu

Le sync existant `lib/eduvia/sync.ts` consomme déjà `/contracts/:id/invoice_steps`. On ajoute :

- Pour chaque step retourné dont `invoice_id IS NOT NULL` : `GET /api/v1/invoices/:invoice_id/lines`
- Upsert dans `eduvia_invoice_lines` (clé : `id` Eduvia)
- Hard delete des lignes orphelines (si Eduvia retire une ligne, on retire en DB)

Coût supplémentaire : 1 appel API par invoice émis. Sur HEOL aujourd'hui (47 step 1 émis + N steps suivants), ça reste raisonnable. Penser à paralléliser par lots de 5-10 pour ne pas allonger la durée totale du sync.

## Règle de calcul cible

Trois listes hardcodées dans le code :

```
WHITELIST_LINE_TYPES = ['PEDAGOGIE']             -- commissionné
BLACKLIST_LINE_TYPES = ['PREMIEREQUIPEMENT']     -- silencieusement ignoré
-- tout autre line_type observé sur un contrat = "unknown", lock du contrat
```

**Calcul base** (utilise UNIQUEMENT la whitelist, pas la blacklist ni le step.including_pedagogie_amount) :

```
base_engagement(contrat) = SUM(eduvia_invoice_lines.amount)
                          WHERE contrat_id = $1
                            AND line_type IN WHITELIST_LINE_TYPES
                            AND EXISTS (
                              SELECT 1 FROM eduvia_invoice_steps s
                              WHERE s.invoice_id = eduvia_invoice_lines.invoice_id
                                AND s.step_number = 1
                                AND s.invoice_state IS NOT NULL
                            )

montant_brut(opco_step s) = SUM(eduvia_invoice_lines.amount)
                            WHERE invoice_id = s.invoice_id
                              AND line_type IN WHITELIST_LINE_TYPES
```

**Circuit breaker (lock du contrat si line_type inconnu)** :

```
unknown_types(contrat) = SELECT DISTINCT line_type FROM eduvia_invoice_lines
                         WHERE contrat_id = $1
                           AND line_type NOT IN WHITELIST_LINE_TYPES
                           AND line_type NOT IN BLACKLIST_LINE_TYPES

si unknown_types(contrat) n'est pas vide :
  → status='locked', lock_reason='unknown_line_type'
  → l'UI affiche la liste des types inconnus dans le tooltip
  → alerte Sentry (capture context : contrat_ref, types, exemples d'amounts)
```

Le contrat reste verrouillé tant que l'admin n'a pas explicitement ajouté chaque type inconnu à la whitelist (commissionnable) ou à la blacklist (ignoré). Ces listes ne sont pas configurables via UI dans la V1 : on modifie le code, on déploie. Si on observe l'apparition récurrente de nouveaux types, on évoluera vers une table `eduvia_line_types_decision` (clé `line_type`, ENUM `whitelist|blacklist`). Pas urgent.

**Audit log à la facturation** : au moment de créer un brouillon, pour chaque step émis utilisé dans le calcul, on log `info` si `|SUM(lines WHERE PEDAGOGIE) - step.including_pedagogie_amount| > 0,01€`. Permet de tracer les invoices "anciens" (arrondi Eduvia, normal) et de détecter une nouvelle divergence non documentée. Format log : `{ contrat_ref, invoice_id, step_pedago, lines_pedago, ecart }`.

Les steps dont la somme des lignes whitelisted est 0 ne sont pas remontés dans la liste billable-events (filtre `> 0`).

## Conséquences code

- `lib/eduvia/client.ts` : ajouter type `EduviaInvoiceLine` et helper `fetchInvoiceLines(instanceUrl, apiKey, invoiceId)`.
- `lib/eduvia/sync.ts` : nouvelle phase post-invoice-steps qui itère sur les invoice_ids non nuls et sync les lignes.
- `lib/queries/billable-events.ts` :
  - **engagement** : remplacer `SUM(eduvia_invoice_steps.total_amount)` par une jointure `eduvia_invoice_lines` filtrée sur `line_type IN WHITELIST_LINE_TYPES`.
  - **opco_step** : pour chaque step retourné, calculer `montant_brut` = `SUM(lines WHERE line_type IN WHITELIST_LINE_TYPES AND invoice_id = step.invoice_id)`. Filtrer les steps dont cette somme est 0.
  - **unknown line_type lock** : avant de retourner les events d'un contrat, scanner les lignes du contrat. Si un `line_type` n'est ni whitelist ni blacklist, marquer tous les events du contrat `status='locked'`, `lock_reason='unknown_line_type'`, et fournir la liste des types inconnus dans le payload pour l'UI.
- `lib/eduvia/sync.ts` : sync les lignes sans filtre ni validation. Toute ligne valide côté API est upsertée. Le calcul de commission gère les types inconnus en aval (philosophie "ne perdre aucune donnée API").
- `lib/queries/billable-events.ts:listManualProjets` → renommer `listBillableProjets`, retirer le filtre `billing_mode='manual'`.
- `lib/echeancier/calc.ts` : à supprimer (calcul de commission sur échéancier prévisionnel, obsolète).
- `lib/actions/factures/brouillons.ts` : retirer la branche `billing_mode='auto'`.
- `types/database.ts` : régénérer après migration.
- Migration DB : create `eduvia_invoice_lines` + supprimer `projets.billing_mode` + UPDATE `projets.taux_commission = 40` pour HEOL.

## UI

- Aucun changement de composant React requis pour la sélection des events facturables, la query filtre côté serveur.
- Sélecteur de projet : liste désormais tous les projets actifs avec contrats Eduvia, plus uniquement `billing_mode='manual'`.
- **Lock `unknown_line_type`** : l'UI existante `lib/queries/billable-events.ts` a déjà la mécanique `status='locked'` + `lock_reason`. On ajoute la valeur `'unknown_line_type'` à l'union des reasons et le composant qui affiche le tooltip de lock doit lister les types inconnus rencontrés sur le contrat.
- **Bonus** : exposer le détail des lignes Eduvia (`line_type`, description, amount) en tooltip/expand sur chaque event billable. Audit clair "voici exactement ce qu'on commissionne". À chiffrer si retenu.

## Garde-fous conservés tels quels

- Lock `missing_deca` : un contrat sans `contract_number` OPCO refuse toujours d'être facturé.
- Exclusion engagement vs opco_step par contrat.
- Idempotence DB via `uq_facture_lignes_event_live` sur `(event_type, event_source_id)`.
- Gapless invoice numbering : aucune facture historique n'est modifiée ou supprimée.

## Listes `line_type` (whitelist / blacklist / unknown)

Trois ensembles hardcodés dans un seul fichier `lib/eduvia/line-types.ts` pour faciliter la review :

```ts
export const WHITELIST_LINE_TYPES = ['PEDAGOGIE'] as const;
export const BLACKLIST_LINE_TYPES = ['PREMIEREQUIPEMENT'] as const;

export function classifyLineType(
  t: string,
): 'whitelist' | 'blacklist' | 'unknown' {
  if (WHITELIST_LINE_TYPES.includes(t as any)) return 'whitelist';
  if (BLACKLIST_LINE_TYPES.includes(t as any)) return 'blacklist';
  return 'unknown';
}
```

Quand un nouveau `line_type` est observé en production :

1. Sentry remonte l'alerte avec contrat_ref + sample d'amounts.
2. L'admin tranche : whitelist (commissionnable) ou blacklist (non commissionnable).
3. PR pour ajouter le type à la liste correspondante. Déploiement.
4. Les contrats concernés redeviennent automatiquement facturables au prochain refresh.

Si on observe l'apparition récurrente de nouveaux types, on évoluera vers une table `eduvia_line_types_decision` (clé `line_type`, ENUM `whitelist|blacklist`) éditable via `/admin/parametres`. Pas urgent pour la V1.

## Hors scope (explicit)

1. **Sync des champs `contrats.support` et `contrats.support_first_equipment`** : utile pour comprendre l'écart `support < npec_amount` sur 27 contrats HEOL mais hors scope ici. Voir mémoire `project_eduvia_support_field` pour les findings.
2. **Factures détachées de tout projet/contrat** : chantier B, brainstormé séparément. Voir mémoire `project_facture_libre_todo`.

## Régularisation historique (décidée 2026-05-12)

On est encore en démo (pas de vraie facturation client), donc on peut tout corriger. Plan :

1. **Avoir total sur FAC-HED-0003** (HT 46 485,33€, TTC 55 782,40€, 41 lignes engagement à 50% × base sale).
   - FAC-HED-0001 (TTC 3 758,40€) est **déjà** annulée par FAC-HED-0002 (avoir, 2026-05-10), donc rien à faire dessus.
   - Après l'avoir sur FAC-HED-0003 : tous les contrats engagés sont à nouveau "libres" de facturation (logique d'avoir compensateur, voir `lib/queries/billable-events.ts:213-220`).
2. **Ré-émission propre** d'une nouvelle facture (FAC-HED-0004 ou suivant) avec la nouvelle règle : 40% × somme des lignes `PEDAGOGIE` du step 1 émis = 40% × **108 561,76€** = **43 424,70€ TTC** (au lieu de 55 782,40€ TTC actuel), soit ~12 358€ TTC d'écart corrigé. La base réelle (108 561,76€) inclut les arrondis Eduvia pré-fix (3,16€ "perdus" vs `including_pedagogie_amount` au niveau step, jugés non récupérables).
3. **L'UPDATE `taux_commission = 40`** sur HEOL doit être fait **avant** la ré-émission, sinon la nouvelle facture repartirait à 50%.

## Curiosité métier non bloquante

Sur 27 contrats HEOL, le champ Eduvia `support` (non sync en DB) est inférieur au `npec_amount` : l'OPCO finance ~80% du NPEC max au lieu de 100%. Trois hypothèses possibles : règle OPCO normale (convention CFA), donnée NPEC mal saisie côté Eduvia, ou régularisation OPCO à venir.

Aucune des trois ne bloque le présent spec : la commission s'applique sur ce que l'OPCO a réellement émis (les lignes `PEDAGOGIE` synchronisées), pas sur le NPEC notionnel. Si plus tard un complément OPCO arrive, il sera commissionné automatiquement. À éclaircir avec HEOL/Eduvia quand l'occasion se présente. Voir mémoire `project_eduvia_support_field` pour les détails.

## Tests à écrire

- `lib/queries/billable-events.test.ts` :
  - Contrat avec uniquement une ligne `PEDAGOGIE` sur step 1 → event engagement à amount.
  - Contrat avec une ligne `PEDAGOGIE` + une ligne `PREMIEREQUIPEMENT` (cas HEOL actuel) → event engagement avec base = pédago uniquement, pas de ligne matériel.
  - Contrat avec une ligne `PREMIEREQUIPEMENT` seule (sans pédago) → pas d'event engagement.
  - Contrat avec un line_type inconnu (ni whitelist ni blacklist) → tous ses events sont retournés `status='locked'`, `lock_reason='unknown_line_type'`, et la liste des types inconnus est fournie au payload.
  - Contrat avec une ligne `PREMIEREQUIPEMENT` noyée dans la même invoice qu'une ligne `PEDAGOGIE` (les 7 cas HEOL "fantômes") → la ligne matos est ignorée silencieusement, l'event engagement est calculé sur la ligne `PEDAGOGIE` seule.
  - Test régression HEOL : la base totale step 1 doit passer de 111 564,92€ (`SUM(total_amount)` de la DB actuelle, manque les 7 lignes matos noyées) à 108 561,76€ (`SUM(lines PEDAGOGIE)` exact via les lignes sync). Total matos réel = 6 500€ (13 lignes).
- `lib/eduvia/sync.test.ts` : un mock fetch retourne 2 lignes par invoice, vérifier que la table est upsert correctement.

## Migration et déploiement

Trois PRs séquentielles pour limiter le blast radius :

1. **PR 1** : migration DB `eduvia_invoice_lines` + sync étendu (sans changer le calcul de commission). On commence à peupler la table dès le premier sync.
2. **PR 2** : calcul de commission migre sur `eduvia_invoice_lines` + lock `unknown_line_type` + audit log écart pédago. Tests en parallèle pour vérifier la nouvelle base sur les data existantes (108 561,76€ HEOL).
3. **PR 3** : suppression `lib/echeancier/calc.ts`, suppression colonne `projets.billing_mode`, UPDATE HEOL `taux_commission = 40`.

Pas de backfill séparé : le sync alimente la table.

**Après le déploiement** (action manuelle, pas une PR) :

4. Avoir total sur FAC-HED-0003 via l'UI factures existante.
5. Vérifier que les 41 contrats HEOL redeviennent "available" dans la liste billable-events (= leur engagement n'est plus considéré comme facturé).
6. Re-créer un brouillon engagement HEOL → la facture sortira automatiquement à 40% × base PEDAGOGIE (validation visuelle du résultat attendu : **43 424,70€ TTC**).

## Métriques de validation post-déploiement

- `SELECT SUM(amount) FROM eduvia_invoice_lines WHERE line_type='PEDAGOGIE' AND ... step 1 émis` sur HEOL → doit donner **108 561,76€**.
- `SELECT SUM(amount) FROM eduvia_invoice_lines WHERE line_type='PREMIEREQUIPEMENT'` sur HEOL → doit donner **6 500€** (13 lignes, dont 7 invisibles dans la DB actuelle car noyées dans des invoices "pédago").
- La sortie de `getBillableEvents(heol_id)` ne contient plus aucun event à `montant_commissionne = 0`.
- Tous les nouveaux brouillons HEOL sont chiffrés sur cette nouvelle base.

## Risques

| Risque                                                                                                | Probabilité | Mitigation                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L'endpoint `/api/v1/invoices/:id/lines` n'est pas dans l'OpenAPI publique et peut casser sans préavis | moyenne     | Pinger l'équipe Eduvia pour confirmation officielle. En cas de 404 au sync, fallback temporaire sur `including_pedagogie_amount` (logique actuelle) avec alerte Sentry critical → debug immédiat. |
| Un nouveau `line_type` apparaît et est silencieusement exclu                                          | nulle       | Circuit breaker : tout type ni whitelist ni blacklist lock le contrat. Sentry alerte. Pas de facturation possible jusqu'à décision humaine.                                                       |
| Sync allongé par les N appels API supplémentaires                                                     | faible      | Paralléliser par lots. Mesurer le temps de sync HEOL avant/après.                                                                                                                                 |
| Un brouillon en cours utiliserait encore l'ancien taux 50% au moment du déploiement                   | faible      | Vérifier qu'aucun brouillon non émis n'existe avant la PR 3. Sinon le supprimer/regénérer après l'UPDATE.                                                                                         |
