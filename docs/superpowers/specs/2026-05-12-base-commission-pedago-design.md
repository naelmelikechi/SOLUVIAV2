# Spec : base de commission HEOL sur lignes pédagogiques

**Date** : 2026-05-12 (réécrit après découverte de l'endpoint `/api/v1/invoices/:id/lines`)
**Statut** : design validé, en attente review du spec écrit
**Auteur** : Nael Melikechi (via Claude)
**Chantier lié, hors scope** : factures libres (à brainstormer séparément, voir mémoire `project_facture_libre_todo`)

## Problème

Aujourd'hui, la base de commission HEOL inclut des frais de premier équipement (500€ "Ordinateur portable") qui ne devraient pas être commissionnés. Le code (`lib/queries/billable-events.ts:154-169`) somme `eduvia_invoice_steps.total_amount` sur tous les step 1 émis, sans distinguer ce qui est pédagogique de ce qui ne l'est pas.

**Impact mesuré sur HEOL** (sur la base d'un taux historique de 50% TTC) : 6 invoices "matériel" de 500€ = 3 000€ inclus à tort dans la base, soit **1 500€ TTC overfacturé** sur FAC-HED-0003 (émise 2026-05-11, statut `emise`).

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

| line_type           | Description Eduvia                                     | Décision Soluvia                   |
| ------------------- | ------------------------------------------------------ | ---------------------------------- |
| `PEDAGOGIE`         | "Échéance n°X - Frais pédagogiques"                    | **Inclus** dans la base commission |
| `PREMIEREQUIPEMENT` | "Premier équipement pédagogique : Ordinateur portable" | **Exclus**                         |

D'autres `line_type` existent probablement (RQTH, MOBILITY, INSCRIPTION…) mais ne sont pas observés sur HEOL aujourd'hui. La règle est extensible (cf. "Whitelist line_type").

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

```
COMMISSION_LINE_TYPES = ['PEDAGOGIE']   -- whitelist (hardcodée, voir Open Questions)

base_engagement(contrat) = SUM(eduvia_invoice_lines.amount)
                          WHERE contrat_id = $1
                            AND line_type IN COMMISSION_LINE_TYPES
                            AND EXISTS (
                              SELECT 1 FROM eduvia_invoice_steps s
                              WHERE s.invoice_id = eduvia_invoice_lines.invoice_id
                                AND s.step_number = 1
                                AND s.invoice_state IS NOT NULL
                            )

montant_brut(opco_step s) = SUM(eduvia_invoice_lines.amount)
                            WHERE invoice_id = s.invoice_id
                              AND line_type IN COMMISSION_LINE_TYPES
```

Les steps dont la somme des lignes commissionnables est 0 ne sont pas remontés dans la liste billable-events (filtre `> 0`).

## Conséquences code

- `lib/eduvia/client.ts` : ajouter type `EduviaInvoiceLine` et helper `fetchInvoiceLines(instanceUrl, apiKey, invoiceId)`.
- `lib/eduvia/sync.ts` : nouvelle phase post-invoice-steps qui itère sur les invoice_ids non nuls et sync les lignes.
- `lib/queries/billable-events.ts` :
  - **engagement** : remplacer `SUM(eduvia_invoice_steps.total_amount)` par une jointure `eduvia_invoice_lines` filtrée sur `line_type IN COMMISSION_LINE_TYPES`.
  - **opco_step** : pour chaque step retourné, calculer `montant_brut` = `SUM(lines WHERE line_type IN COMMISSION_LINE_TYPES AND invoice_id = step.invoice_id)`. Filtrer les steps dont cette somme est 0.
- `lib/queries/billable-events.ts:listManualProjets` → renommer `listBillableProjets`, retirer le filtre `billing_mode='manual'`.
- `lib/echeancier/calc.ts` : à supprimer (calcul de commission sur échéancier prévisionnel, obsolète).
- `lib/actions/factures/brouillons.ts` : retirer la branche `billing_mode='auto'`.
- `types/database.ts` : régénérer après migration.
- Migration DB : create `eduvia_invoice_lines` + supprimer `projets.billing_mode` + UPDATE `projets.taux_commission = 40` pour HEOL.

## UI

- Aucun changement de composant React requis pour la sélection des events facturables. La query filtre déjà côté serveur.
- Sélecteur de projet : liste désormais tous les projets actifs avec contrats Eduvia, plus uniquement `billing_mode='manual'`.
- **Bonus** : exposer le détail des lignes Eduvia (`line_type`, description, amount) en tooltip/expand sur chaque event billable. Audit clair "voici exactement ce qu'on commissionne". À chiffrer si retenu.

## Garde-fous conservés tels quels

- Lock `missing_deca` : un contrat sans `contract_number` OPCO refuse toujours d'être facturé.
- Exclusion engagement vs opco_step par contrat.
- Idempotence DB via `uq_facture_lignes_event_live` sur `(event_type, event_source_id)`.
- Gapless invoice numbering : aucune facture historique n'est modifiée ou supprimée.

## Whitelist `line_type`

Pour la V1, hardcodée à `['PEDAGOGIE']` dans le code. Quand un nouveau `line_type` apparaîtra (RQTH, MOBILITY…), il faudra :

- décider explicitement si Soluvia le commissionne ou non,
- ajouter une migration data si la décision change pour le passé (rare).

Si on observe l'apparition récurrente de nouveaux types, on évoluera vers une table `eduvia_line_types_commissionnable` (clé `line_type`, bool `commissionnable`) éditable côté admin. Pas urgent.

## Hors scope (explicit)

1. **Sync des champs `contrats.support` et `contrats.support_first_equipment`** : utile pour comprendre l'écart `support < npec_amount` sur 27 contrats HEOL mais hors scope ici. Voir mémoire `project_eduvia_support_field` pour les findings.
2. **Factures détachées de tout projet/contrat** : chantier B, brainstormé séparément. Voir mémoire `project_facture_libre_todo`.

## Régularisation historique (décidée 2026-05-12)

On est encore en démo (pas de vraie facturation client), donc on peut tout corriger. Plan :

1. **Avoir total sur FAC-HED-0003** (HT 46 485,33€, TTC 55 782,40€, 41 lignes engagement à 50% × base sale).
   - FAC-HED-0001 (TTC 3 758,40€) est **déjà** annulée par FAC-HED-0002 (avoir, 2026-05-10), donc rien à faire dessus.
   - Après l'avoir sur FAC-HED-0003 : tous les contrats engagés sont à nouveau "libres" de facturation (logique d'avoir compensateur, voir `lib/queries/billable-events.ts:213-220`).
2. **Ré-émission propre** d'une nouvelle facture (FAC-HED-0004 ou suivant) avec la nouvelle règle : 40% × somme des lignes `PEDAGOGIE` = 40% × 108 564,92€ = **43 425,97€ TTC** (au lieu de 55 782,40€ TTC actuel), soit ~12 356€ TTC d'écart corrigé.
3. **L'UPDATE `taux_commission = 40`** sur HEOL doit être fait **avant** la ré-émission, sinon la nouvelle facture repartirait à 50%.

## Curiosité métier non bloquante

Sur 27 contrats HEOL, le champ Eduvia `support` (non sync en DB) est inférieur au `npec_amount` : l'OPCO finance ~80% du NPEC max au lieu de 100%. Trois hypothèses possibles : règle OPCO normale (convention CFA), donnée NPEC mal saisie côté Eduvia, ou régularisation OPCO à venir.

Aucune des trois ne bloque le présent spec : la commission s'applique sur ce que l'OPCO a réellement émis (les lignes `PEDAGOGIE` synchronisées), pas sur le NPEC notionnel. Si plus tard un complément OPCO arrive, il sera commissionné automatiquement. À éclaircir avec HEOL/Eduvia quand l'occasion se présente. Voir mémoire `project_eduvia_support_field` pour les détails.

## Tests à écrire

- `lib/queries/billable-events.test.ts` :
  - Contrat avec uniquement une ligne `PEDAGOGIE` sur step 1 → event engagement à amount.
  - Contrat avec une ligne `PEDAGOGIE` + une ligne `PREMIEREQUIPEMENT` (cas HEOL actuel) → event engagement avec base = pédago uniquement, pas de ligne matériel.
  - Contrat avec une ligne `PREMIEREQUIPEMENT` seule (sans pédago) → pas d'event engagement.
  - Contrat avec un line_type inconnu → la ligne est ignorée (pas dans la whitelist), un warning est loggé pour signaler le nouveau type.
  - Test régression HEOL : la base totale step 1 doit passer de 111 564,92€ (`SUM(total_amount)`) à 108 564,92€ (`SUM(lines PEDAGOGIE)`).
- `lib/eduvia/sync.test.ts` : un mock fetch retourne 2 lignes par invoice, vérifier que la table est upsert correctement.

## Migration et déploiement

Trois PRs séquentielles pour limiter le blast radius :

1. **PR 1** : migration DB `eduvia_invoice_lines` + sync étendu (sans changer le calcul de commission). On commence à peupler la table dès le premier sync.
2. **PR 2** : calcul de commission migre sur `eduvia_invoice_lines`. Tests en parallèle pour vérifier l'équivalence avec l'ancienne base sur les data existantes (108 564,92€ HEOL).
3. **PR 3** : suppression `lib/echeancier/calc.ts`, suppression colonne `projets.billing_mode`, UPDATE HEOL `taux_commission = 40`.

Pas de backfill séparé : le sync alimente la table.

**Après le déploiement** (action manuelle, pas une PR) :

4. Avoir total sur FAC-HED-0003 via l'UI factures existante.
5. Vérifier que les 41 contrats HEOL redeviennent "available" dans la liste billable-events (= leur engagement n'est plus considéré comme facturé).
6. Re-créer un brouillon engagement HEOL → la facture sortira automatiquement à 40% × base PEDAGOGIE (validation visuelle du résultat attendu : ~43 425,97€ TTC).

## Métriques de validation post-déploiement

- `SELECT SUM(amount) FROM eduvia_invoice_lines WHERE line_type='PEDAGOGIE' AND ... step 1 émis` sur HEOL → doit donner **108 564,92€**.
- La sortie de `getBillableEvents(heol_id)` ne contient plus aucun event à `montant_commissionne = 0`.
- Tous les nouveaux brouillons HEOL sont chiffrés sur cette nouvelle base.

## Risques

| Risque                                                                                                | Probabilité | Mitigation                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| L'endpoint `/api/v1/invoices/:id/lines` n'est pas dans l'OpenAPI publique et peut casser sans préavis | moyenne     | Pinger l'équipe Eduvia pour confirmation officielle. Garder `including_pedagogie_amount` en DB comme fallback de calcul.                   |
| Un nouveau `line_type` apparaît et est silencieusement exclu                                          | moyenne     | Logger un warning à chaque ligne d'un type non whitelisté observé. Alerte Sentry sur ce log → on rajoute le type au moment où il apparaît. |
| Sync allongé par les N appels API supplémentaires                                                     | faible      | Paralléliser par lots. Mesurer le temps de sync HEOL avant/après.                                                                          |
| Un brouillon en cours utiliserait encore l'ancien taux 50% au moment du déploiement                   | faible      | Vérifier qu'aucun brouillon non émis n'existe avant la PR 3. Sinon le supprimer/regénérer après l'UPDATE.                                  |
