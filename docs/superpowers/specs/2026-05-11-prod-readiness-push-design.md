# Push prod-readiness - design

**Date** : 2026-05-11
**Auteur** : Nael (via Claude)
**Statut** : draft - en attente de revue

## Contexte

Avant d'ouvrir aux testeurs internes (canal WhatsApp à venir), on consolide en un seul push :

- 2 quick wins UX restants (404 CDP, Commission cliquable)
- Tests manquants sur les comportements HEOL récents (régression silencieuse possible)
- Refacto data-table avec recherche/tri par colonne (base technique pour Projets, Commercial, Factures)
- 3 features Vague 2 (Production consolidée, Production filtre projet, Commercial vue Tableau)
- Hardening DB Supabase (RLS initplan, FK indexes, multi-permissive)

**Hors scope** : KTISIS-4 (repo séparé), CTR-01524 (action externe Eduvia), création canal WhatsApp.

## Séquence d'exécution

```
J1 matin : Phase 1 (quick wins + tests) ──┐
J1 ap-m   : Phase 4a (RLS initplan) ──────┤  parallèle
J2        : Phase 2 (data-table refacto)
J3        : Phase 3 (Production + Commercial features)
J4 si dispo : Phase 4b (multi-permissive lots)
```

Choisi : phases 1 + 4a en parallèle, puis 2 → 3, et 4b si bande passante.

---

## Phase 1 - Quick wins UX + tests HEOL

### 1.1 Audit 404 CDP

**Hypothèse à valider** : le retour testeur mentionnait que les onglets "Administration" et "CDP" 404 depuis la fiche projet. La route `/admin` a été créée (`e186d9c`). Pour "CDP", aucune route n'existe - probablement les stat-cards "CDP" et "Backup CDP" qui pointent vers `/admin/utilisateurs`.

**Action** :

1. Reproduire en local : `/projets/[ref]` → cliquer stat-card CDP → vérifier comportement
2. Si 404 : fix au cas par cas (route manquante, redirect, ou changement de target)
3. Si OK : documenter dans le commit que c'est résolu par `f054021`

### 1.2 Colonne Commission cliquable

**Décidé** : la cellule devient un `<Link>` vers `/projets/[ref]` (cohérent avec Client/CDP), avec `hover:underline`.

**Fichier** : `components/projets/projet-list-columns.tsx:99-103`

```tsx
cell: ({ row }) => (
  <Link
    href={`/projets/${row.original.ref}`}
    onClick={(e) => e.stopPropagation()}
    className="text-sm tabular-nums hover:underline"
  >
    {row.original.taux_commission}%
  </Link>
),
```

Note : la ligne entière est déjà cliquable (row click → détail). Le lien explicite sert d'indicateur visuel via le `hover:underline`. Le `stopPropagation` évite le double event.

### 1.3 Tests billable-events HEOL

**3 comportements récents non couverts** (cf. `project_todos_open.md`) :

1. **Base step 1 OPCO émis** (`lib/queries/billable-events.ts:engagementBaseByContrat`)
   - Cas : contrat ENGAGÉ Eduvia + facture n°1 OPCO existante → commission HEOL calculée sur le montant step 1
   - Cas inverse : contrat ENGAGÉ mais pas de step 1 → exclu du brouillon
   - Cas : avoir émis sur le step 1 → recalcul de la base

2. **TTC inclus** (`lib/actions/factures/brouillons.ts:526-587`)
   - Cas : facture HEOL avec `tva_mode = 'inclus'` → HT = TTC / 1.2 (arrondi 2 décimales)
   - Cas : `tva_mode = 'standard'` → HT direct
   - Cas : taux TVA personnalisé (5.5%, 0%)

3. **Avoir compensateur libère le contrat** (`lib/queries/billable-events.ts:132-200`)
   - Cas : contrat facturé puis avoir total → réapparaît dans le brouillon suivant
   - Cas : avoir partiel → ne réapparaît PAS (base diminuée seulement)
   - Cas : 2 avoirs successifs → idempotence

**Fichiers tests** :

- `lib/queries/billable-events.heol-base.test.ts`
- `lib/actions/factures/brouillons.ttc-inclus.test.ts`
- `lib/queries/billable-events.avoir-compensateur.test.ts`

Approche : vitest + fixtures statiques (pas de DB). Mocker uniquement le client Supabase au strict minimum nécessaire pour exercer la logique pure.

---

## Phase 2 - Refacto data-table column header

### 2.1 État actuel

`components/shared/data-table/data-table-column-header.tsx` (41 lignes) gère uniquement le tri (clic header → toggle asc/desc). Pas de recherche par colonne. Les filtres globaux sont dans `data-table-toolbar.tsx` (Status, Typologie en select multi).

### 2.2 Cible

Header enrichi avec :

- **Clic sur le titre** : tri (comportement actuel préservé)
- **Petite icône loupe** à droite du titre (visible uniquement si `column.getCanFilter()`)
- **Clic loupe** : ouvre un popover avec un `<input>` de recherche (debounce 200ms via `useDebounce` existant)
- **Indicateur visuel** quand un filtre est actif (point bleu sur la loupe)
- **Echap** ou clic ailleurs : ferme le popover sans reset

Pour les colonnes avec options finies (statut, typologie) : popover affiche checklist (réutilise le pattern de `data-table-toolbar`).

### 2.3 API

```tsx
// Opt-in par colonne :
{
  accessorKey: 'client',
  header: ({ column }) => (
    <DataTableColumnHeader
      column={column}
      title="Client"
      filterVariant="text" // 'text' | 'select' | 'none'
    />
  ),
  enableColumnFilter: true,
}
```

Si `filterVariant === 'none'` ou absent → comportement actuel (juste tri).

### 2.4 Migration

1. Refacto du composant + tests unitaires sur l'input (normalisation accents via `normalizeForSearch`, debounce, focus management)
2. Migration table Projets en premier (table la plus utilisée, référence pour les autres)
3. Migration Commercial, Factures, Équipe au fur et à mesure
4. Le `data-table-toolbar` peut être simplifié à terme (filtres déplacés sur les colonnes) - pas dans ce push, juste laisser cohabiter

### 2.5 Compatibilité

Toutes les tables qui n'opt-in pas conservent le comportement actuel. Aucune régression.

### 2.6 Tests

- Test unitaire : `data-table-column-header.test.tsx`
  - Render avec `filterVariant='text'` → loupe visible
  - Saisie débounce → callback appelé après 200ms
  - Indicateur actif quand `column.getFilterValue()` non vide
  - Accents : "élève" matche "eleve"

---

## Phase 3 - Features pages Production + Commercial

### 3.1 Production - vue consolidée OPCO + Soluvia

**État actuel** : `production-page-client.tsx` (999 lignes) a un toggle `perspective: 'opco' | 'soluvia'` qui scale les valeurs par le ratio commission. 1 mode = 1 vue.

**Cible** : ajout d'un 3ᵉ mode `'consolide'` qui affiche les 2 perspectives **côte à côte** dans le même tableau (colonnes Production OPCO | Production SOLUVIA | etc.) avec totaux croisés.

**Refacto opportuniste** : extraire le rendu de chaque vue (mensuel, par projet, par client, chart) en sous-composants dans `components/production/views/`. Objectif : faire passer le fichier sous 400 lignes.

**Risque** : performance si on calcule 2× les rolling/YTD. Mitigation : `useMemo` sur `buildDisplayData` par perspective + 1 seul passage de calcul cumulé.

### 3.2 Production - filtre projet multi-select

**État actuel** : filtre par client (dropdown checkbox) déjà présent. Pas de filtre projet.

**Cible** : dropdown checkbox identique pour les projets, propagé aux 4 vues (mensuel, par projet, par client, chart). State via URL search params (`?projets=ref1,ref2`) pour partage de lien.

**Détail** :

- Liste des projets disponibles = projets visibles selon le rôle (admin = tous, CDP = ses projets)
- Si filtre actif : les vues "par client" et "par projet" affichent uniquement les filtrés. La vue mensuelle aggrège uniquement les projets filtrés.
- "Tout cocher" / "Tout décocher" en tête de dropdown

### 3.3 Commercial - vue Tableau

**État actuel** : `pipeline-board.tsx` (861 lignes) en mode Kanban exclusif.

**Cible** : toggle Kanban/Tableau dans le header de la page Commercial. Mode Tableau utilise la `DataTable` refactorée Phase 2 (filtre + tri par colonne).

**Colonnes du Tableau** :

- Prospect (raison sociale)
- Contact (nom + email)
- Stage (avec badge couleur)
- Temps dans le stage actuel
- Date de prochain RDV
- Commercial assigné
- Actions (ouvrir sheet detail comme aujourd'hui)

**Persistance du choix** : `localStorage.commercial_view = 'kanban' | 'table'` (préférence user, pas critique).

**Refacto opportuniste** : extraction des cards Kanban en composant dédié pour clarifier `pipeline-board.tsx`.

---

## Phase 4 - DB hardening

### 4.1 RLS initplan (41 policies)

**Pattern POC validé sur `notifications`** (commit `ddae84d`) :

```sql
-- Avant
CREATE POLICY "..." ON tbl FOR SELECT
  USING (auth.uid() = user_id);

-- Après
CREATE POLICY "..." ON tbl FOR SELECT
  USING ((SELECT auth.uid()) = user_id);
```

`(SELECT auth.uid())` est évalué une fois par requête au lieu d'une fois par ligne. Gain proportionnel à la cardinalité.

**Liste des tables impactées** : à extraire via `supabase advisor` au début de la phase. Migration unique `20260512NNNNNN_rls_initplan_batch.sql` avec toutes les policies réécrites.

**Sécurité** : aucun changement fonctionnel des policies (juste optimisation). Tests pgTAP existants doivent passer à l'identique.

### 4.2 FK indexes manquants (26)

**Pattern** : pour chaque FK sans index, créer `CREATE INDEX CONCURRENTLY idx_<table>_<col> ON <table>(<col>)`.

Liste à extraire via advisor au début de la phase. Une migration par lot de 5-10 indexes (chacune transactionnelle, donc petits lots pour limiter le lock window).

### 4.3 Multi-permissive policies (329)

**Le plus gros chantier**. Pattern : quand plusieurs policies permissive s'appliquent au même rôle/action, Postgres évalue chaque policy à chaque ligne (`OR` cumulatif). Consolider en 1 policy par couple (table, action, role).

**Approche** : découpage par module pour limiter le risque.

- Lot 1 : `projets`, `clients`, `contrats` (cœur métier)
- Lot 2 : `factures`, `lignes_facture`, `paiements`, `ajustements`
- Lot 3 : `saisies_temps`, `absences`
- Lot 4 : `qualite`, `evidences`
- Lot 5 : reste (notifications, bug_reports, idees, etc.)

Chaque lot = 1 migration + tests pgTAP de non-régression sur les permissions admin/cdp/commercial.

**Important** : ne PAS faire les 329 en un seul push. Lot 1 dans ce push (preuve de concept multi-tables), les suivants dans des sessions dédiées.

### 4.4 Unused indexes (25) - optionnel

À ne faire QUE si bande passante. Analyse préalable : `SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0` sur 30 jours minimum. Drop uniquement les indexes confirmés sans aucun usage.

---

## Tests & vérification globale

À chaque phase :

1. `npm run lint` clean
2. `npm run build` clean
3. Tests vitest passants (objectif : +25 tests dans ce push)
4. Migrations Supabase appliquées en local d'abord, puis prod
5. Vérification visuelle des features sur app.mysoluvia.com après deploy

**Critères de succès du push** :

- Aucune régression sur les pages existantes
- Nouveaux comportements testés (HEOL)
- Refacto data-table opérationnel sur Projets minimum
- Production consolidée + filtre projet livrés
- Commercial Tableau livré
- RLS initplan déployé (gain perf mesurable sur Supabase logs)
- Multi-permissive lot 1 déployé

---

## Files touchés (estimation)

**Phase 1** (~7 fichiers)

- `components/projets/projet-list-columns.tsx`
- 3 nouveaux fichiers de tests
- Éventuels fix 404 CDP

**Phase 2** (~5 fichiers)

- `components/shared/data-table/data-table-column-header.tsx`
- `components/shared/data-table/index.ts`
- `components/projets/projet-list-columns.tsx` (opt-in filtre par colonne)
- 1 test
- Éventuellement `lib/utils/search.ts` (déjà existant `normalizeForSearch`)

**Phase 3** (~10 fichiers)

- `components/production/production-page-client.tsx` (split en sous-fichiers)
- 4-5 nouveaux sous-composants `components/production/views/*`
- `components/commercial/pipeline-board.tsx` (extraction cards)
- `components/commercial/pipeline-table.tsx` (nouveau)
- `components/commercial/commercial-page-client.tsx` (toggle Kanban/Table)

**Phase 4** (~3 migrations SQL)

- `20260512NNNNNN_rls_initplan_batch.sql`
- `20260512NNNNNN_fk_indexes_batch.sql`
- `20260512NNNNNN_multipermissive_lot1.sql`

---

## Décisions ouvertes

Aucune à ce stade. Tout est cadré.
