# Indicateur de pilotage CDP — « Contrats à facturer »

Date : 2026-06-22
Statut : approuvé, en implémentation

## Contexte

Premier indicateur d'un futur dashboard de pilotage destiné aux chefs de projet
(CDP). Quand un CDP arrive dans SOLUVIA, il doit voir d'un coup d'œil combien de
contrats ont une échéance OPCO **due et non encore transmise** — c.-à-d. à aller
facturer côté Eduvia.

Exemple de ligne ciblée (contrat réel `CTR-02061`) :

```
033202606022192   Nawal BESSE   CONSEILLER COMMERCIAL   0016-HEO-APP   HEOL ACADEMY   AKTO
```

## Règle métier (définition « stricte », validée)

Un contrat est **à facturer** si :

- son `contract_state` est `ENGAGE` ou `TRANSMIS`,
- `archive = false` et `facturation_verrouillee = false` (lock manuel facturation
  SOLUVIA, exclu par cohérence),
- il possède ≥1 ligne `eduvia_invoice_steps` avec `invoice_state IS NULL`
  **et** `opening_date ≤ aujourd'hui` (échéance OPCO ouverte mais jamais transmise).

Une ligne par contrat = l'échéance due la plus ancienne (la plus en retard).
Tri du plus en retard au moins. Le décompte du badge = nombre de contrats
distincts répondant à la règle.

Toute la donnée est déjà synchronisée depuis Eduvia ; aucune nouvelle source.

## Périmètre / RLS

- Scoping CDP **gratuit** : la policy RLS `eduvia_invoice_steps_select`
  (`20260615130000_rls_is_admin_initplan_select.sql`) filtre déjà par
  `contrat → projet.cdp_id / backup_cdp_id`, admin = tout.
- Badge + entrée sidebar visibles pour `admin` et `cdp`. Données scopées RLS.

## Surface

| Fichier                                                    | Rôle                                                                                                                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/queries/contrats-a-facturer.ts` _(new)_               | `getContratsAFacturer()` (DB, RLS via session) + noyau pur `selectContratsAFacturer()` (testable, sans DB). OPCO via `getActiveOpcoMapping` + `resolveOpcoFromIdcc`. |
| `app/(dashboard)/a-facturer/page.tsx` _(new)_              | Server component, `revalidate = 30`.                                                                                                                                 |
| `app/(dashboard)/a-facturer/loading.tsx` _(new)_           | Skeleton.                                                                                                                                                            |
| `components/a-facturer/a-facturer-table.tsx` _(new)_       | Client : `DataTable` + clic ligne → `ContratDetailSheet` (réutilisé tel quel).                                                                                       |
| `components/a-facturer/a-facturer-columns.tsx` _(new)_     | Définition des colonnes.                                                                                                                                             |
| `hooks/use-badge-counts.ts`                                | Clé `contratsAFacturer`, `fetchAFacturerCount()` (count distinct, RLS-scopé), refresh ciblé + abonnement realtime `eduvia_invoice_steps`.                            |
| `components/layout/sidebar.tsx`                            | Entrée nav « À facturer » (section Facturation, icône `Send`) + `badgeConfig['/a-facturer']` (`bg-blue-500`) + `INITIAL_BADGE_COUNTS`.                               |
| `supabase/migrations/<ts>_realtime_a_facturer.sql` _(new)_ | Ajoute `eduvia_invoice_steps` à la publication `supabase_realtime` (idempotent, calqué sur `20260511151008_realtime_badges.sql`).                                    |
| `__tests__/contrats-a-facturer.test.ts` _(new)_            | Cas limites du noyau pur.                                                                                                                                            |

## Colonnes de la liste

N° contrat (`contract_number`, fallback `ref`) · Apprenti · Formation · Projet
(`projet.ref`) · Client · OPCO · Échéance due (step + date + « retard N j ») ·
Montant (`total_amount` du step).

## Réutilisation

Badges realtime (`useBadgeCounts`), `DataTable` partagé, `ContratDetailSheet`,
résolution OPCO (`getActiveOpcoMapping` / `resolveOpcoFromIdcc`), helpers dates
(`toLocalISODate`, `diffDaysIso`). Pattern « 1 indicateur » duplicable pour les
prochains indicateurs de pilotage.

## Hors périmètre

- Transmission OPCO elle-même (se fait dans Eduvia ; SOLUVIA reste lecture seule).
- Définition « élargie » (échéances prévisionnelles sans step généré) — écartée.
- Autres indicateurs de pilotage (itérations suivantes).

## Vérification

- Test unitaire du noyau pur (step futur exclu, step transmis/réglé exclu,
  contrat ANNULE/RUPTURE/NOTSENT exclu, verrouillé exclu, multi-steps → 1 contrat,
  tri par retard).
- `tsc` + lint.
- Probe read-only contre la donnée réelle : doit renvoyer 4 contrats (HEOL,
  CDP Ilies Ladj), dont `033202606022192 / BESSE`.
