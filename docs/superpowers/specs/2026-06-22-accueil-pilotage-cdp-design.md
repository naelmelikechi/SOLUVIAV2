# Refonte des vues — Accueil pilotage CDP + supervision superadmin

Date : 2026-06-22
Statut : approuvé, en implémentation

## Objectif

`/accueil` devient la **landing universelle, rôle-adaptative** : le CDP voit
immédiatement « ce qu'il doit faire », le superadmin voit « tout » (tous les
contrats non facturés sur Eduvia). `/dashboard` chiffré reste séparé.

## Routing `/accueil`

Par `role` + `projetsCount` (PAS le bucket `getCollabStatus`, qui classe en
`commercial` tout porteur de `pipeline_access`, CDP compris) :

1. `admin`/`superadmin` → **AccueilSuperadmin** (supervision globale).
2. sinon, ≥1 projet CDP actif → **AccueilCdp** (worklist « À faire »).
3. sinon, `commercial`/`pipeline_access` → redirect `/commercial/prospects`.
4. sinon → onboarding actuel (inchangé).

Login (`login/page.tsx`, 2 push) → `/accueil`. Entrée sidebar « Accueil »
rendue visible à tous (aujourd'hui `unassignedOnly`), en tête de _Pilotage_.

## CDP — worklist « À faire »

Cartes-action triées par urgence (rouge → orange → bleu), masquées si compteur
= 0, état vide « Tout est à jour ✅ ». Aucune nouvelle source :

| Item                       | Source                                                | Lien           |
| -------------------------- | ----------------------------------------------------- | -------------- |
| Contrats à facturer (échu) | `getContratsAFacturer()`                              | /a-facturer    |
| Factures en retard         | `getDashboardData().facturesEnRetard`                 | /facturation   |
| Échéances prêtes           | `getDashboardData().echeancesAFacturer`               | /facturation   |
| Jours sans saisie          | saisies_temps semaine + `businessDaysElapsedThisWeek` | /temps         |
| Contrats sans progression  | `getDashboardData().contratsSansProgression`          | /projets       |
| Notifications non lues     | `notifications` count                                 | /notifications |

Pièce maîtresse : aperçu inline des 3 contrats à facturer les plus en retard,
clic → `ContratDetailSheet`, « voir tout » → /a-facturer.

Agrégateur : `getAccueilCdpData()` (RLS CDP via session).

## Superadmin — supervision « Contrats non facturés Eduvia »

Synthèse (X échus · Y à venir · montant total non transmis) + `DataTable`
global de **tous** les contrats actifs avec ≥1 `eduvia_invoice_steps`
`invoice_state = null` (toutes dates) : N° contrat · Apprenti · Projet · **CDP
responsable** · Client · OPCO · Nb échéances non transmises · Prochaine
échéance · Montant non transmis · **Statut (échu / à venir)**. Clic →
`ContratDetailSheet`.

Query : `getContratsNonFacturesGlobal()` (session admin = tout via RLS).

## Noyau pur (réutilisation)

`lib/queries/contrats-a-facturer.ts` :

- extraire `isContratEligible(c)` (états facturables, non archivé, non
  verrouillé), partagé.
- `selectContratsAFacturer` (inchangé : échu seul, 1 ligne/contrat) — garde ses
  16 tests.
- **nouveau** `selectContratsNonFactures` : toutes échéances non transmises
  (toutes dates), 1 ligne/contrat, champs `nonTransmisCount`,
  `montantNonTransmis`, `prochaineEcheance`, `statut` (`echu`/`a_venir`),
  `cdpNom`. Tri : échu d'abord, puis par prochaine échéance.

`lib/utils/dates.ts` : `businessDaysElapsedThisWeek(now)` extrait (le hook
`use-badge-counts` réutilise au lieu de sa copie privée).

## Surface

- `lib/queries/contrats-a-facturer.ts` (généralisé), `lib/queries/accueil.ts`
  _(new : getAccueilCdpData, getContratsNonFacturesGlobal)_.
- `lib/utils/dates.ts` (+ helper), `hooks/use-badge-counts.ts` (dédup).
- `app/(dashboard)/accueil/page.tsx` (routing rôle).
- `components/accueil/accueil-cdp.tsx`, `accueil-superadmin.tsx`,
  `accueil-supervision-columns.tsx` _(new)_ ; onboarding existant conservé.
- `app/(auth)/login/page.tsx` (redirect), `components/layout/sidebar.tsx`
  (Accueil universel).

## Hors périmètre

- Pas de reshuffle global de la sidebar (juste Accueil universel).
- Commercial : simple redirect (pas de home dédié pour l'instant).
- Pas de nouvel indicateur métier au-delà des signaux existants.

## Vérification

- Tests unitaires : `selectContratsNonFactures` (échu/à venir, multi-steps,
  futur inclus, montant, tri), routing rôle (helper pur), dates helper.
- `selectContratsAFacturer` : 16 tests existants restent verts.
- `tsc` + lint + `next build`.
- Probe read-only prod : superadmin global (échu+à venir, montants, CDP),
  worklist CDP (compteurs cohérents avec /a-facturer = 4 échus).
