# Projets internes - Séparation et pilotage

**Date** : 2026-05-12
**Statut** : Approuvé (en attente d'implémentation)

## Contexte

Aujourd'hui les projets internes (formation interne, congés, administratif, etc.) et les vrais projets clients sont visuellement mélangés dans la liste `/projets`. Le flag `est_interne` existe déjà en base avec un client système et une série de refs dédiée, mais l'UI ne reflète pas cette séparation et les heures non-billable ne sont pilotées nulle part.

Objectif : extraire les projets internes dans une section dédiée `/projets/internes` avec dashboard de pilotage (admin) et auto-suivi (CDP).

## Audience

- **Admin** : pilotage RH/coûts, voit l'agrégé multi-CDP, gère les catégories.
- **CDP** : auto-suivi de ses heures internes (congés, formation, etc.), pas de gestion.

## Architecture

### Routes

- `app/(dashboard)/projets/internes/page.tsx` - Server Component, charge les données en parallèle, lit `searchParams` (periode, scope).
- `app/(dashboard)/projets/internes/loading.tsx` - skeleton.
- `app/(dashboard)/projets/internes/actions.ts` - server actions admin (create/update/archive catégorie).

### Navigation

Nouvel item "Projets internes" dans la sidebar (sous "Projets"), visible par tous. Icon `Building2` ou équivalent.

### Tabs (base-ui)

- **Statistiques** : visible par tous. Scope = "moi" pour CDP, switch "Moi / Toute l'équipe" pour admin.
- **Configuration** : admin uniquement, masqué côté UI pour CDP, backstop server qui rejette.

### Period switcher

Composant Select dans le header : Mois en cours / Trimestre / Année / 12 mois glissants. État via URLSearchParams (`?periode=trimestre&scope=equipe`) pour partage de liens.

Le chart "Tendance 12 mois glissants" garde sa fenêtre fixe (insensible au period switcher).

### Toggle `/projets` (page existante)

Switch "Inclure projets internes" dans la toolbar de `projets-data-table.tsx`, état persisté en localStorage clé `projets:includeInternes`, défaut `false`. Filtre appliqué côté client sur `row.est_interne`. La query `getProjetsListEnriched` retourne déjà tout, on ajoute juste `est_interne` au type retourné si pas présent. Pastille ambre sur les lignes internes pour cohérence avec `time-grid.tsx`.

## Données et schéma DB

### Migration : transformer `categorie_interne` TEXT/CHECK en table de référence

Le CHECK actuel limite à 6 valeurs hardcodées (FORMATION, CONGES, ABSENCE, ADMINISTRATIF, COMMERCIAL, AUTRE). Pour permettre CRUD admin, on passe en table de référence (pattern `typologies`).

```sql
-- Migration 20260512xxxxxx_categories_internes_table.sql

CREATE TABLE categories_internes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  libelle TEXT NOT NULL,
  ordre INT NOT NULL DEFAULT 0,
  actif BOOLEAN NOT NULL DEFAULT true,
  archive BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_categories_internes_actif ON categories_internes(actif) WHERE actif = true;

-- Seed des 6 valeurs existantes
INSERT INTO categories_internes (code, libelle, ordre) VALUES
  ('FORMATION', 'Formation interne', 1),
  ('CONGES', 'Congés', 2),
  ('ABSENCE', 'Absence', 3),
  ('ADMINISTRATIF', 'Administratif', 4),
  ('COMMERCIAL', 'Commercial', 5),
  ('AUTRE', 'Autre', 6);

-- Ajout FK sur projets
ALTER TABLE projets ADD COLUMN categorie_interne_id UUID REFERENCES categories_internes(id);

-- Backfill
UPDATE projets
SET categorie_interne_id = c.id
FROM categories_internes c
WHERE projets.categorie_interne = c.code;

-- Drop ancien CHECK et colonne TEXT
ALTER TABLE projets DROP CONSTRAINT IF EXISTS chk_categorie_interne_valeurs;
ALTER TABLE projets DROP CONSTRAINT IF EXISTS chk_categorie_interne_coherence;
ALTER TABLE projets DROP COLUMN categorie_interne;

-- Nouveau CHECK cohérence
ALTER TABLE projets ADD CONSTRAINT chk_categorie_interne_coherence CHECK (
  (est_interne = false AND categorie_interne_id IS NULL)
  OR (est_interne = true AND categorie_interne_id IS NOT NULL)
);

-- Index FK
CREATE INDEX idx_projets_categorie_interne_id ON projets(categorie_interne_id) WHERE categorie_interne_id IS NOT NULL;

-- RLS categories_internes
ALTER TABLE categories_internes ENABLE ROW LEVEL SECURITY;

CREATE POLICY cat_internes_select_all ON categories_internes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY cat_internes_admin_write ON categories_internes
  FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'superadmin'))
  WITH CHECK (get_user_role() IN ('admin', 'superadmin'));

-- Trigger updated_at
CREATE TRIGGER trg_categories_internes_updated_at
  BEFORE UPDATE ON categories_internes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Audit trigger
CREATE TRIGGER trg_categories_internes_audit
  AFTER INSERT OR UPDATE OR DELETE ON categories_internes
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
```

### Impact sur le code existant

Refs à mettre à jour pour pointer vers `categorie_interne_id` + jointure (ou vue) :

- `lib/queries/temps.ts` (lignes 15, 84, 108, 178, 189)
- `lib/queries/intercontrat.ts` (lignes 113, 127-140)
- `app/(dashboard)/accueil/page.tsx` (lignes 46, 63, 66)
- `app/api/cron/intercontrat-alerte/route.ts`
- `components/temps/time-grid.tsx` (ne consomme que `est_interne`, OK)

Pattern : sélectionner `categorie_interne_id, categories_internes(code, libelle)` via la jointure Supabase et exposer `categorie_interne` (objet) dans le type au lieu du string.

### Queries (`lib/queries/projets-internes.ts`)

```ts
export async function getCategoriesInternes(): Promise<CategorieInterne[]>
export async function getProjetsInternesList(): Promise<ProjetInterneEnrichi[]>
export async function getStatsInternes(params: {
  periode: 'mois' | 'trimestre' | 'annee' | '12mois';
  scope: 'moi' | 'equipe';
}): Promise<StatsInternes>
```

Retour `StatsInternes` :
- `totalHeures: number`
- `parCategorie: Array<{ categorie_id, code, libelle, heures, pct }>`
- `parCdp: Array<{ user_id, nom, prenom, heuresInternes, heuresClient, ratio }> | null` (null si scope=moi)
- `tendance12Mois: Array<{ mois: 'YYYY-MM', parCategorie: Record<categorie_id, number> }>`
- `ratioBillable: { heuresInternes, heuresClient, ratio, delta }` (delta vs période précédente)

### Server actions (admin)

`app/(dashboard)/projets/internes/actions.ts` :

- `createCategorieInterneAction(formData)` :
  1. zod validate (`code` uppercase A-Z_, libellé, ordre)
  2. `requireAdmin()` helper
  3. INSERT `categories_internes`
  4. INSERT projet associé (`est_interne=true`, `categorie_interne_id=...`, ref auto série interne, client système Soluvia, cdp_id=null ou user système)
  5. `revalidatePath('/projets/internes')`
- `updateCategorieInterneAction(id, formData)` : libellé + ordre + actif (code immutable)
- `archiveCategorieInterneAction(id)` : archive=true sur catégorie + projet associé. Warning si saisies < 30j.

## UI - Onglet Statistiques

### Layout

```
PageHeader "Projets internes"
  - Period switcher (Select)
  - Scope switch (admin uniquement : Moi / Équipe)
Tabs : [Statistiques] [Configuration (admin)]
─────────────────
KPI Cards (4 col desktop, stack mobile) :
  - Total heures internes (période)
  - Catégorie #1 (libellé + heures + %)
  - Ratio non-billable (% + delta vs période précédente)
  - admin : Nb collaborateurs actifs / CDP : Mon ratio personnel

Section "Répartition par catégorie"
  - Bar horizontal (recharts), trié desc

Section "Heures par CDP" (admin only)
  - Table compacte triable : CDP, heures internes, heures client, ratio
  - Top 10 par défaut, bouton "Voir tous"

Section "Tendance 12 mois glissants"
  - Stacked bar mensuel par catégorie
  - Légende interactive
```

### Composants

`components/projets-internes/` :
- `internes-page-client.tsx` - wrapper Tabs + period/scope state (URL sync)
- `internes-stats-tab.tsx` - data fetcher + layout
- `kpi-card-internes.tsx` (réutilise `components/dashboard/mini-kpi-card.tsx`)
- `categorie-bar-chart.tsx` (recharts via shadcn `components/ui/chart.tsx` si présent, sinon `npx shadcn add chart`)
- `cdp-internes-table.tsx`
- `tendance-stacked-chart.tsx`

### Empty states

- Aucune saisie période : illustration + CTA "Saisir mon temps" -> `/temps`
- CDP sans saisies internes : message bienveillant, pas de "no data" sec.

## UI - Onglet Configuration (admin only)

### Visibilité

Masqué côté UI si `!isAdmin(user.role)`. Backstop server : `requireAdmin()` dans la page ou redirect vers `/projets/internes` sans le tab.

### Layout

```
PageHeader sous-titre "Gérer les catégories de projets internes"
                                          [+ Nouvelle catégorie]
DataTable (shared/data-table) :
  Colonnes : Ordre | Code | Libellé | Heures (12 mois) | Actif | Actions
  Actions menu : Éditer / Archiver / Désarchiver
  Filtres : Actif / Archivé
```

### Composants

- `internes-config-tab.tsx` - server fetcher + table
- `categorie-interne-form-dialog.tsx` - Dialog create/edit, form + zod
  - Champs : code (uppercase, [A-Z_]+, unique, immutable après création), libellé, ordre
- `categorie-interne-archive-dialog.tsx` - confirm + warning si saisies récentes

### Garde-fous

- Pas de hard delete -> archive uniquement
- Archive bloquée (toast warning) si saisies dans les 30 derniers jours
- Code unique (UNIQUE en DB + catch côté form)

## Tests

### Tests SQL (`supabase/tests/`)

- `05_categories_internes_rls.sql` : admin INSERT/UPDATE OK, CDP refusé, anon refusé. SELECT OK pour authenticated.
- `06_categorie_interne_fk_coherence.sql` : `est_interne=true` exige `categorie_interne_id`, `est_interne=false` interdit.

### Tests unitaires (Vitest)

- `lib/queries/projets-internes.test.ts` :
  - `getStatsInternes` totaux/pourcentages corrects
  - Scope `moi` vs `equipe` filtre par `user_id`
  - Bornes périodes (mois/trimestre/année/12mois)
  - Tendance 12 mois renvoie 12 buckets remplis (zéros inclus)
- `app/(dashboard)/projets/internes/actions.test.ts` :
  - `createCategorieInterneAction` refuse non-admin (401/403)
  - `archiveCategorieInterneAction` warn si saisies < 30j
  - Validation zod : code invalide rejeté

### E2E (si setup Playwright présent, sinon skip)

- /projets/internes : tabs visibles selon rôle
- Toggle /projets persiste en localStorage

### CI

Hook pre-push exige `npm test` passant. Pas de `--no-verify`.

## Découpage de l'implémentation

L'implémentation se découpe en 5 étapes ordonnées :

1. **Migration DB** : table `categories_internes`, backfill, FK, RLS, tests SQL
2. **Refactor code existant** : adapter `temps.ts`, `intercontrat.ts`, `accueil/page.tsx` au nouveau schéma
3. **Page Stats** : route, queries, composants charts/cards, period/scope switcher, empty states
4. **Onglet Configuration + actions** : table CRUD, dialogs, server actions, tests unitaires
5. **Toggle `/projets` + sidebar** : switch localStorage, item sidebar, pastille ambre

Chaque étape est validable indépendamment et commit-friendly.

## Out of scope

- Export CSV des stats (peut être ajouté plus tard)
- Notifications "ton ratio non-billable dépasse X%" (relève du module notifications)
- Intégration avec le module qualité (formation = preuve qualiopi) - à creuser séparément
- Migration des saisies historiques pré-2026 (les `categorie_interne` legacy sont gérés par le backfill)
