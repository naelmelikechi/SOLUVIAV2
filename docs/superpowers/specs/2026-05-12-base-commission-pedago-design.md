# Spec : base de commission sur part pédagogique uniquement

**Date** : 2026-05-12
**Statut** : **EN PAUSE** (2026-05-12) — en attente clarification HEOL/Eduvia sur l'écart `support` vs `npec_amount` (voir "Questions ouvertes" plus bas)
**Auteur** : Nael Melikechi (via Claude)
**Chantier lié, hors scope** : [factures libres](./TODO-facture-libre-design.md) (à brainstormer séparément)

## Questions ouvertes bloquant la reprise

L'investigation 2026-05-12 a révélé qu'un champ Eduvia non sync, `contrats.support`, vaut **moins** que `npec_amount` sur 27 des 41 contrats HEOL avec step 1 pédago émis. Concrètement :

- 27 contrats HEOL ont `support ≈ 80% × npec_amount`, donc step 1 OPCO = 40% × support = 32% × npec
- 11 contrats HEOL ont `support = npec_amount` (cas standard), step 1 OPCO = 40% × support = 40% × npec
- Les 11 contrats à 100% support sont exactement ceux qui ont (ou peuvent recevoir) un `support_first_equipment = 500€`

**À clarifier avec HEOL/Eduvia avant reprise** :

1. Est-il normal que `support < npec_amount` pour ces 27 contrats ? Convention CFA particulière, retenue OPCO, plafond annuel ?
2. L'OPCO peut-il émettre un "complément support" pour ces contrats plus tard, ou la base actuelle est-elle figée ?
3. La règle "commission HEOL = 50% TTC du financement OPCO" s'applique-t-elle sur le `npec_amount` notionnel ou sur le `support` réel ? (impacte le chiffre 1 500€ overbill)

Tant que ces points ne sont pas tranchés, on ne déploie pas la migration. Le calcul `SUM(including_pedagogie_amount)` proposé ci-dessous reste correct dans tous les cas (il exclut bien les 500€ matériel) ; la question est juste **sur quoi appliquer la commission** : sur le `support` actuel (qu'on lit déjà via `including_pedagogie_amount`) ou sur le `npec_amount` complet (qui peut nécessiter une régularisation manuelle).

## Problème

Aujourd'hui, la base de commission HEOL inclut des frais matériel/équipement (500€ par contrat) qui ne devraient pas être commissionnés. Le code (`lib/queries/billable-events.ts:154-169`) somme `eduvia_invoice_steps.total_amount` sur tous les step 1 émis, sans distinguer ce qui est pédagogique de ce qui ne l'est pas.

**Impact mesuré sur HEOL** : 6 steps "matériel" de 500€ = 3 000€ inclus à tort dans la base. À 50% de commission, cela représente **1 500€ overfacturé** sur l'historique HEOL.

## Découverte clé

Eduvia n'expose **pas** le détail des lignes d'un bordereau OPCO via son API (vérifié sur la spec OpenAPI publique + appel live sur 3 contrats HEOL 2026-05-12). Mais elle émet **les frais matériel comme un step distinct** :

| Champ                        | Step pédagogique | Step matériel      |
| ---------------------------- | ---------------- | ------------------ |
| `step_number`                | 1                | 1 (oui, identique) |
| `invoice_id`                 | ex: 61           | ex: 62 (différent) |
| `total_amount`               | 2 666,56€        | 500,00€            |
| `including_pedagogie_amount` | 2 666,56€        | 0,00€              |
| `including_rqth_amount`      | 0,00€            | 0,00€              |

La signature d'un step "pur matériel" est donc claire : `including_pedagogie_amount = 0`. Tous les frais matériel HEOL ont été transmis le 2026-05-07 en émission groupée.

## Règle de calcul cible

Remplacer la base actuelle par la part pédagogique :

```
base_engagement(contrat) = SUM(COALESCE(eduvia_invoice_steps.including_pedagogie_amount, 0))
                          WHERE contrat_id = $1
                            AND step_number = 1
                            AND invoice_state IS NOT NULL

montant_brut(opco_step) = eduvia_invoice_steps.including_pedagogie_amount
```

`SUM` (plutôt qu'un `WHERE including_pedagogie_amount > 0`) est volontairement choisi pour rester correct si Eduvia émet un jour un step mixte (pédago + matériel sur le même invoice_id). La part matériel est silencieusement exclue, sans perdre la part pédago.

## Périmètre

- **Tous les projets** (mode auto + mode manual). En pratique, seul HEOL a aujourd'hui des contrats actifs ; les 6 projets "Interne SOLUVIA" en mode auto ont 0 contrat et 0% de commission.
- Le mode `auto` (commission sur échéancier prévisionnel saisi à la main) devient legacy : on l'aligne sur la logique step-1-OPCO nettoyée.

### Conséquences code

- `lib/queries/billable-events.ts` :
  - **engagement** (lignes 154-169) : remplacer `SUM(total_amount)` par `SUM(COALESCE(including_pedagogie_amount, 0))`. Pas de filtre supplémentaire : un contrat dont le step 1 pédago est 0 (cas où seul un bordereau matériel a été émis) verra son event engagement omis car `brut === 0` est déjà filtré ligne 256.
  - **opco_step** (ligne 315) : remplacer `total_amount` par `including_pedagogie_amount`. Ajouter un filtre `including_pedagogie_amount > 0` directement dans la query Supabase (lignes 141-147) pour ne pas remonter de steps "pur matériel" à 0€ dans la liste billable-events. Ce filtre est sûr car chaque step est un event isolé (pas une agrégation), donc un step à 0 n'a rien à contribuer.
- `lib/queries/billable-events.ts:listManualProjets` → renommer `listBillableProjets`, retirer le filtre `billing_mode='manual'`.
- `lib/echeancier/calc.ts` : à supprimer (calcul de commission sur échéancier prévisionnel). Vérifier d'abord qu'aucun autre call site n'en dépend pour des usages annexes.
- `lib/actions/factures/brouillons.ts` : retirer la branche `billing_mode='auto'` dans la création de brouillon, ne garder que la voie billable-events.
- Migration DB : supprimer la colonne `projets.billing_mode` et son CHECK constraint. YAGNI : on rétablira si on a besoin de réintroduire un mode différent.

### UI

- Les steps "pur matériel" (`including_pedagogie_amount = 0`) sont **filtrés en amont par la query** et n'apparaissent jamais dans la liste billable-events. Aucun changement de composant React requis.
- Les steps mixtes (jamais observés chez HEOL aujourd'hui) apparaîtraient avec `montant_brut = including_pedagogie_amount` ; la part matériel est exclue silencieusement.
- Sélecteur de projet dans la page de création de brouillon : liste désormais tous les projets actifs avec contrats Eduvia (au lieu des projets `billing_mode='manual'`).

## Garde-fous conservés tels quels

- Lock `missing_deca` : un contrat sans `contract_number` OPCO refuse toujours d'être facturé.
- Exclusion engagement vs opco_step par contrat : un contrat ne peut être facturé qu'une fois, en engagement OU en opco_step.
- Idempotence DB via `uq_facture_lignes_event_live` sur `(event_type, event_source_id)`.
- Gapless invoice numbering : aucune facture historique n'est modifiée ou supprimée.

## Hors scope (explicit)

1. **Correction de l'historique HEOL (1 500€ overbillé)**. Si une régularisation commerciale est nécessaire, elle se fera par avoir manuel séparé. Le présent spec ne réécrit pas les factures déjà émises.
2. **Prise en compte de `including_rqth_amount`**. Aucune occurrence non nulle observée chez HEOL. Si la valeur devient non nulle un jour, on devra décider : la base inclut-elle pédago + RQTH, ou pédago seul ? À documenter au moment où le cas se présente.
3. **Factures détachées de tout projet/contrat** : chantier B, brainstormé séparément, voir mémoire `project_facture_libre_todo`.

## Tests à écrire

- `lib/queries/billable-events.test.ts` :
  - Un contrat avec uniquement un step 1 pédago → base = pédago, 1 event engagement.
  - Un contrat avec un step 1 pédago + un step 1 matériel (cas HEOL actuel) → base = pédago uniquement, 1 event engagement à la part pédago, le step matériel n'est pas remonté.
  - Un contrat avec un step opco_step pur matériel (`including_pedagogie_amount = 0`) → l'event opco_step n'est pas remonté.
  - Un contrat avec un step opco_step mixte (`total_amount > including_pedagogie_amount > 0`) → event opco_step avec `montant_brut = including_pedagogie_amount`.
- Test de régression sur HEOL : sur les 47 step 1 émis (dont 6 "pur matériel" à 500€ et 41 pédagogiques), la base totale doit passer de 111 564,92€ (`SUM(total_amount)`) à 108 564,92€ (`SUM(including_pedagogie_amount)`).

## Migration et déploiement

1. Code + tests : un seul PR.
2. Migration DB : retrait de `projets.billing_mode` dans une migration séparée appliquée après le déploiement du code (pour éviter qu'un ancien build ne lise un champ inexistant en window de déploiement).
3. Pas de backfill. Pas de migration data.

## Métriques de validation post-déploiement

- Sortir la base de commission HEOL via `getBillableEvents(heol_id)` → vérifier que la somme des `montant_brut` events engagement = 108 564,92€ (vs 111 564,92€ avant).
- Vérifier dans l'UI que les 6 steps "500€ matériel" n'apparaissent plus dans la liste billable-events.

## Risques

| Risque                                                                     | Probabilité | Mitigation                                                                                                                                                |
| -------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un projet client à venir n'utilise pas Eduvia (paiement direct entreprise) | moyenne     | Ce cas tombera dans le chantier B (factures libres). Pas un blocker du présent spec.                                                                      |
| Eduvia change la sémantique de `including_pedagogie_amount` un jour        | faible      | Le snapshot des montants au moment de la facturation (via `npec_snapshot`, `taux_commission_snapshot` dans `facture_lignes`) garantit l'audit historique. |
| Suppression de `billing_mode` casse un consommateur oublié                 | moyenne     | Grep avant migration. Si un usage subsiste, retarder la suppression DDL et garder le champ en DB (DEFAULT 'manual').                                      |
