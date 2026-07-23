# Distinction "Engagement (étape 1)" / "Échéance n°N" - facturation à l'engagement

Date : 2026-07-23
Statut : validé par Nael (conversation)

## Problème

Dans la facturation à l'engagement (HEOL et projets similaires), on ne voit pas
clairement si une ligne/facture correspond à la 1ère étape de facturation
(engagement, step 1 OPCO) ou à une échéance suivante (step 2+). L'info existe
en base (`facture_lignes.event_type` + `facture_lignes.mois_relatif`,
`BillableEvent.type` + `step_number`) mais le vocabulaire UI est hétérogène
("Engagement", "OPCO #2", "Règlement OPCO #2") et absent de la liste des
factures et de la carte Finance projet.

## Design (affichage uniquement, aucune migration)

### 1. Terminologie unifiée

Helper central `lib/utils/billing-step-label.ts` :

- `billingStepLabel(type, stepNumber)` :
  - `engagement` -> `Engagement (étape 1)`
  - `opco_step` + step N -> `Échéance n°N` (fallback `Échéance` si step null)
- Variante courte pour badges si besoin de place.

Règle : hyphens simples, pas de tirets cadratins dans les strings UI.

### 2. Onglet "À l'engagement" (`components/facturation/manuel-tab.tsx`)

Badges de la colonne Type :
- vert `Engagement (étape 1)` (au lieu de `Engagement`)
- bleu `Échéance n°2` (au lieu de `OPCO #2`)

### 3. Libellés des lignes de facture (`lib/actions/factures/brouillon-from-events.ts`)

À la génération :
- `Commission {taux}% - Engagement (étape 1)`
- `Commission {taux}% - Échéance n°{N} OPCO`

Se propage automatiquement au détail facture et au PDF. Les factures déjà
émises gardent leur libellé d'origine (descriptions figées, contrainte légale,
pas de rétro-modification).

### 4. Liste des factures (colonne "Contenu")

Nouveau badge dérivé des lignes de la facture :
- `Engagement` si toutes les lignes event sont engagement
- `Échéance n°N` si un seul step distinct
- `Échéances` si plusieurs steps
- `Mixte` si engagement + échéances
- rien pour les factures sans lignes event (libres/manuelle)

Implémentation : agréger `event_type`/`mois_relatif` dans la query de liste
(`lib/queries/factures.ts`), pas de champ dénormalisé sur `factures`
(écarté : dérivable des lignes, risque de désynchronisation).

### 5. Carte Finance projet (`components/projets/projet-finance-section.tsx`)

Split du KPI "Commission facturée" en deux sous-lignes :
- part engagement (lignes event_type=engagement)
- part échéances (lignes event_type=opco_step)

Visible uniquement pour les projets au modèle engagement (ou si au moins une
ligne event existe).

## Hors scope

- Aucune modification des factures émises (légal).
- Pas de changement du modèle de données ni des règles de facturation
  (exclusion engagement <-> opco_step inchangée).
- Onglet Échéancier (l'autre modèle) non concerné.

## Tests

- Unit : `billingStepLabel` (engagement, step 2, step null).
- Unit/intégration existants sur brouillon-from-events : mettre à jour les
  snapshots/attentes de libellés.
- Vérif visuelle liste factures + onglet À l'engagement (HEOL a des données).
