# Audit dashboard SOLUVIA vs spec 08

Comparaison rapide de `/dashboard` actuel vs `specs/08-dashboard.html`.
Date : 2026-05-05.

## Ce qui est en place

| Section spec                                                 | Statut     | Implementation                                                                                                                                       |
| ------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| §1 Principes (temps reel + snapshots, alertes, configurable) | Partiel    | Snapshot M-1 OK, KPIs masquables non implementes                                                                                                     |
| §2 Alertes operationnelles                                   | OK         | `dashboard-page-client.tsx:242-285` 5 alertes : factures en retard, echeances a facturer, taches qualite, temps non saisi, contrats sans progression |
| §3 KPIs financiers                                           | OK         | Production, Facture, Encaisse, En retard (lignes 330-374)                                                                                            |
| §4 KPIs operationnels                                        | Partiel    | Projets actifs, Contrats actifs OK. Manque : nb apprenants, nb formations, taux occupation CDP                                                       |
| §5 KPIs qualite & pedagogie                                  | **Absent** | Aucune des 6 sous-sections : Qualite, Pedagogie, Reussite, Financement, Abandons, Rentabilite                                                        |
| §6 Snapshot mensuel & comparaisons                           | OK         | Comparaison M-1 affichee a cote des KPIs financiers                                                                                                  |
| §7 Notifications email                                       | OK         | 6 crons emails (factures-retard, fenetre-debut/fin, rapport-mensuel, temps-non-saisi, intercontrat)                                                  |
| §8 Badges menu                                               | OK         | Sidebar.tsx affiche les compteurs par section                                                                                                        |
| §9 Permissions & RLS                                         | OK         | RLS Postgres + filtre cdp_id cote queries                                                                                                            |

## Gaps notables

### 1. Sparklines KPI 12 mois (spec §3 ligne 293)

> "Sparklines — Mini-graphiques sur 12 mois pour chaque KPI. Le dernier point (mois en cours) est en surbrillance. Optionnel et masquable."

Aucun sparkline n'est present sur les KPI cards actuelles. La data de
production-mensuelle existe deja en DB et est utilisee par `RevenueTrendChart`,
donc c'est branchable.

Effort : moyen (composant Sparkline reutilisable + binding sur 4 KPIs financiers).

### 2. KPIs Qualiopi (spec §5)

Six sous-blocs prevus :

- **Qualite Qualiopi** : taux completion par projet (deja calcule dans
  `getQualiteSummaries`, exposable directement)
- **Pedagogie** : taux progression apprenants (deja calcule dans
  `computeProgressionRatios` cote indicateurs)
- **Reussite** : taux reussite examens (PAS de data en DB aujourd'hui)
- **Financement** : taux NPEC vs facture (a calculer)
- **Abandons** : nb ruptures contrats (data dispo via `contracts.contract_state IN ('resilie', 'ANNULE')`)
- **Rentabilite** : marge SOLUVIA / cout temps (deja calcule dans
  `projet-performance.ts`)

Effort : variable. 4/6 ont la data, 2/6 n'ont pas la data (Reussite, Financement
NPEC partiellement).

### 3. KPIs configurables / masquables (spec §1)

> "Chaque KPI est masquable. Les metriques affichees sont personnalisables par utilisateur."

Aujourd'hui les KPIs sont en dur dans `dashboard-page-client.tsx`. Spec implique
une preference utilisateur stockee en DB (table `user_dashboard_prefs` ou
similaire).

Effort : moyen (table + UI preferences + filtre rendering).

### 4. KPIs operationnels manquants (spec §4)

- Nombre apprenants en cours (calculable via `apprenants` joints aux contrats
  avec contract_state actif)
- Nombre formations actives
- Taux occupation CDP (h facturable / h totales)

Effort : petit (queries + 3 cards).

## Recommandation de priorisation

Si on doit choisir 1 chose a faire en priorite : **#1 Sparklines** sur les
4 KPIs financiers existants. Forte valeur visuelle, data deja disponible,
pas de decision metier complexe.

Ensuite : **#4 KPIs operationnels manquants** (apprenants, formations,
occupation CDP) parce que la data existe deja.

Le **#2 KPIs Qualiopi** demande un brief metier : quel calcul exact pour le
"taux de completion", quelle pediode, quelle granularite.

Le **#3 Personnalisation** est une fonctionnalite a part entiere a brieffer
aussi (drag-and-drop, masquage, ordre).
