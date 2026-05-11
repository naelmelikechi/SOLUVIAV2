# Push prod-readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer un push consolidé prod-readiness pour SOLUVIA - quick wins UX, tests HEOL manquants, refacto data-table (recherche/tri par colonne), features Production + Commercial, et hardening DB Supabase.

**Architecture:** 4 phases séquencées (1+4a parallèle → 2 → 3 → 4b si dispo). Spec source : `docs/superpowers/specs/2026-05-11-prod-readiness-push-design.md`.

**Tech Stack:** Next.js 16 App Router, TypeScript, TanStack Table, Tailwind 4, shadcn/ui (base-ui), Supabase (Postgres + RLS + pgTAP), Vitest.

---

## Phase 1 - Quick wins UX + tests TTC inclus

### Task 1: Audit 404 CDP sur fiche projet

**Files:**

- Investigate: `components/projets/projet-stat-cards.tsx:69-81`
- Verify routes: `app/(dashboard)/admin/utilisateurs/` exists

**Context:** Le retour testeur mentionnait que "Administration" et "CDP" 404 depuis la fiche projet. La route `/admin` a été créée (`e186d9c`). Les stat-cards "CDP" et "Backup CDP" pointent vers `/admin/utilisateurs`. Cette tâche vérifie le comportement réel et corrige si besoin.

- [ ] **Step 1: Démarrer le dev server**

```bash
npm run dev
```

- [ ] **Step 2: Reproduire le scénario**

Ouvrir le navigateur sur `http://localhost:3000/projets/<un-ref-existant>`. Cliquer sur la stat-card "CDP". Noter l'URL et le status (200 ou 404).

- [ ] **Step 3a: Si 404 + URL = /admin/utilisateurs**

Vérifier que `app/(dashboard)/admin/utilisateurs/page.tsx` existe et qu'il n'y a pas de redirect cassé. Si la page existe mais 404, c'est un problème de proxy.ts ou de RLS qui bloque l'accès silencieusement. Lire `proxy.ts` à la racine et `app/(dashboard)/admin/utilisateurs/page.tsx`. Fix au cas par cas.

- [ ] **Step 3b: Si OK (200)**

Documenter en commit que c'est déjà résolu par `f054021`. Pas de modification de code, juste passer à Task 2.

- [ ] **Step 4: Commit (si fix effectué)**

```bash
git add <fichiers modifiés>
git commit -m "fix(projets): cliquer stat-card CDP n ouvre plus une page 404"
```

Si pas de fix nécessaire, sauter ce commit et noter dans la PR/commit de Task 2 que le 404 CDP était déjà résolu.

---

### Task 2: Colonne Commission cliquable

**Files:**

- Modify: `components/projets/projet-list-columns.tsx:95-104`

- [ ] **Step 1: Lire le fichier pour confirmer la structure actuelle**

```bash
sed -n '95,104p' components/projets/projet-list-columns.tsx
```

Attendu :

```tsx
{
  accessorKey: 'taux_commission',
  header: ({ column }) => (
    <DataTableColumnHeader column={column} title="Commission" />
  ),
  cell: ({ row }) => (
    <span className="text-sm tabular-nums">
      {row.original.taux_commission}%
    </span>
  ),
},
```

- [ ] **Step 2: Modifier la cellule pour devenir un lien**

Remplacer le bloc `cell:` ci-dessus par :

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

Vérifier que `import Link from 'next/link';` est déjà présent en haut du fichier (ligne 4). Sinon l'ajouter.

- [ ] **Step 3: Vérifier que la page Projets ne casse pas**

```bash
npm run build
```

Expected: build OK, aucune erreur TypeScript.

- [ ] **Step 4: Tester visuellement**

Sur `http://localhost:3000/projets`, survoler la colonne Commission. Le texte doit s'underliner au survol. Clic doit naviguer vers `/projets/<ref>`.

- [ ] **Step 5: Commit**

```bash
git add components/projets/projet-list-columns.tsx
git commit -m "feat(projets): colonne Commission cliquable vers la fiche projet"
```

---

### Task 3: Extraire helper pur pour calcul TTC inclus

**Files:**

- Create: `lib/utils/facture-totaux-ttc-inclus.ts`
- Modify: `lib/actions/factures/brouillons.ts:526-545` (utiliser le helper)
- Test: `__tests__/facture-totaux-ttc-inclus.test.ts`

**Context:** Le calcul "TTC inclus" (commission HEOL exprimée TTC dans le contrat, on dérive HT/TVA à rebours) est inline dans `createFactureFromEvents` (780 lignes). On l'extrait en fonction pure pour pouvoir le tester sans mocker Supabase.

- [ ] **Step 1: Écrire les tests (TDD)**

Créer `__tests__/facture-totaux-ttc-inclus.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { computeFactureTotauxTtcInclus } from '@/lib/utils/facture-totaux-ttc-inclus';

describe('computeFactureTotauxTtcInclus', () => {
  it('cas standard 20% : total_ttc=120 -> ht=100, tva=20', () => {
    const result = computeFactureTotauxTtcInclus(
      [{ montant_commissionne: 120 }],
      20,
    );
    expect(result.totalTtc).toBe(120);
    expect(result.totalHt).toBe(100);
    expect(result.montantTva).toBe(20);
  });

  it('arrondit au centime sur somme : 33.33 + 33.33 + 33.34 = 100 ttc', () => {
    const result = computeFactureTotauxTtcInclus(
      [
        { montant_commissionne: 33.33 },
        { montant_commissionne: 33.33 },
        { montant_commissionne: 33.34 },
      ],
      20,
    );
    expect(result.totalTtc).toBe(100);
    expect(result.totalHt).toBe(83.33);
    expect(result.montantTva).toBe(16.67);
  });

  it('TVA 5.5% (taux reduit)', () => {
    const result = computeFactureTotauxTtcInclus(
      [{ montant_commissionne: 105.5 }],
      5.5,
    );
    expect(result.totalTtc).toBe(105.5);
    expect(result.totalHt).toBe(100);
    expect(result.montantTva).toBe(5.5);
  });

  it('TVA 0% : ht = ttc', () => {
    const result = computeFactureTotauxTtcInclus(
      [{ montant_commissionne: 100 }],
      0,
    );
    expect(result.totalTtc).toBe(100);
    expect(result.totalHt).toBe(100);
    expect(result.montantTva).toBe(0);
  });

  it('ligne HT calculee par event (compatibilite SUM(facture_lignes.montant_ht) == facture.montant_ht)', () => {
    const result = computeFactureTotauxTtcInclus(
      [{ montant_commissionne: 60 }, { montant_commissionne: 60 }],
      20,
    );
    expect(result.totalTtc).toBe(120);
    expect(result.totalHt).toBe(100);
    expect(result.lignesHt).toEqual([50, 50]);
  });

  it('cas vide : totaux = 0', () => {
    const result = computeFactureTotauxTtcInclus([], 20);
    expect(result.totalTtc).toBe(0);
    expect(result.totalHt).toBe(0);
    expect(result.montantTva).toBe(0);
    expect(result.lignesHt).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- facture-totaux-ttc-inclus
```

Expected: FAIL avec `Cannot find module '@/lib/utils/facture-totaux-ttc-inclus'`.

- [ ] **Step 3: Implémenter le helper**

Créer `lib/utils/facture-totaux-ttc-inclus.ts` :

```ts
/**
 * Calcule les totaux d'une facture en mode "TTC inclus" :
 * la commission est exprimée TTC, on dérive HT/TVA à rebours.
 *
 * Convention HEOL (billing_mode='manual') : montant_commissionne est TTC.
 *
 * Garantit : SUM(lignesHt) === totalHt (sinon les rapports cassent).
 */
export function computeFactureTotauxTtcInclus(
  events: { montant_commissionne: number }[],
  tauxTva: number,
): {
  totalTtc: number;
  totalHt: number;
  montantTva: number;
  lignesHt: number[];
} {
  const totalTtc =
    Math.round(events.reduce((s, e) => s + e.montant_commissionne, 0) * 100) /
    100;
  const totalHt = Math.round((totalTtc / (1 + tauxTva / 100)) * 100) / 100;
  const montantTva = Math.round((totalTtc - totalHt) * 100) / 100;
  const lignesHt = events.map(
    (e) =>
      Math.round((e.montant_commissionne / (1 + tauxTva / 100)) * 100) / 100,
  );
  return { totalTtc, totalHt, montantTva, lignesHt };
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- facture-totaux-ttc-inclus
```

Expected: PASS (6 tests).

- [ ] **Step 5: Remplacer le code inline dans brouillons.ts**

Lire `lib/actions/factures/brouillons.ts` lignes 520-600 pour repérer le bloc exact. Remplacer :

```ts
const tauxTva = 20;
const totalTtc =
  Math.round(resolved.reduce((s, e) => s + e.montant_commissionne, 0) * 100) /
  100;
const totalHt = Math.round((totalTtc / (1 + tauxTva / 100)) * 100) / 100;
const montantTva = Math.round((totalTtc - totalHt) * 100) / 100;
const montantTtc = totalTtc;
```

Par :

```ts
const tauxTva = 20;
const { totalTtc, totalHt, montantTva, lignesHt } =
  computeFactureTotauxTtcInclus(resolved, tauxTva);
const montantTtc = totalTtc;
```

Ajouter l'import en haut du fichier :

```ts
import { computeFactureTotauxTtcInclus } from '@/lib/utils/facture-totaux-ttc-inclus';
```

Puis dans la boucle `resolved.map((e) => ...)` (vers ligne 581), remplacer le calcul de `ligneHt` par l'utilisation de `lignesHt[index]` :

```ts
const lignes = resolved.map((e, i) => {
  const typeLabel =
    e.type === 'engagement'
      ? 'Engagement contrat'
      : `Règlement OPCO #${e.step_number ?? '?'}`;
  const ligneHt = lignesHt[i]!;
  // ... reste inchangé
```

- [ ] **Step 6: Vérifier le build + lint**

```bash
npm run build && npm run lint
```

Expected: clean.

- [ ] **Step 7: Run all tests pour non-régression**

```bash
npm test
```

Expected: tous verts (les tests existants `billable-events`, `factures-gapless`, etc. ne doivent pas régresser).

- [ ] **Step 8: Commit**

```bash
git add lib/utils/facture-totaux-ttc-inclus.ts __tests__/facture-totaux-ttc-inclus.test.ts lib/actions/factures/brouillons.ts
git commit -m "refactor(factures): extrait helper TTC inclus + 6 tests"
```

---

## Phase 4a - DB hardening : RLS initplan + FK indexes (parallèle Phase 1)

### Task 4: Extraire la liste des policies auth_rls_initplan

**Files:**

- Investigate via Supabase MCP advisor

- [ ] **Step 1: Lister les warnings auth_rls_initplan**

Utiliser le tool `mcp__plugin_supabase_supabase__get_advisors` avec `type='performance'`. Filtrer les entries `name='auth_rls_initplan'`. Pour chaque entry, noter : table, policy name, command (SELECT/INSERT/UPDATE/DELETE), définition actuelle de USING/WITH CHECK.

Si l'advisor MCP renvoie des warnings sans CREATE POLICY brut, fallback : exécuter via `mcp__plugin_supabase_supabase__execute_sql` :

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%')
  AND qual NOT LIKE '%(SELECT auth.uid())%'
  AND (with_check IS NULL OR with_check NOT LIKE '%(SELECT auth.uid())%');
```

- [ ] **Step 2: Enregistrer la liste dans un fichier temporaire**

Créer `tmp/rls-initplan-list.md` (non commité, juste pour cette session) listant les policies à réécrire, format :

```
table | policy_name | cmd | qual_avant | qual_apres
```

---

### Task 5: Écrire la migration RLS initplan batch

**Files:**

- Create: `supabase/migrations/20260512000000_rls_initplan_batch.sql`

- [ ] **Step 1: Générer le script SQL**

Pour chaque policy listée en Task 4, écrire dans la migration :

```sql
-- Policy: <table>.<policy_name>
DROP POLICY IF EXISTS "<policy_name>" ON public.<table>;
CREATE POLICY "<policy_name>" ON public.<table>
  FOR <cmd>
  TO <roles si non public>
  USING (<qual réécrit avec (SELECT auth.uid()) et (SELECT auth.jwt()) et (SELECT public.is_admin())>)
  WITH CHECK (<idem si applicable>);
```

**Pattern de réécriture** : remplacer chaque appel non-wrapped par un `(SELECT ...)`.

- `auth.uid()` → `(SELECT auth.uid())`
- `auth.jwt()` → `(SELECT auth.jwt())`
- `is_admin()` → `(SELECT public.is_admin())`
- `get_user_role()` → `(SELECT public.get_user_role())`

**Ne pas modifier** : la sémantique des conditions (égalités, AND/OR, IN clauses). Uniquement wrapper les appels de fonction.

Exemple concret (notifications, déjà fait dans `ddae84d`) :

```sql
-- Avant
USING (auth.uid() = user_id)

-- Après
USING ((SELECT auth.uid()) = user_id)
```

- [ ] **Step 2: Appliquer en local d'abord**

```bash
npx supabase db reset --local
npx supabase db push --local
```

Expected: aucune erreur SQL.

- [ ] **Step 3: Vérifier que les policies sont bien rewrites**

```bash
npx supabase db psql --local -c "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND qual LIKE '%auth.uid()%' AND qual NOT LIKE '%(SELECT auth.uid())%';"
```

Expected: 0 (toutes les policies ont été wrapped).

- [ ] **Step 4: Lancer les tests pgTAP existants**

```bash
npm run test:pgtap || cd supabase && npx supabase test db
```

Expected: tous verts. Si rouge, c'est probablement une réécriture incorrecte - revoir la policy fautive.

- [ ] **Step 5: Appliquer en prod via MCP**

Utiliser `mcp__plugin_supabase_supabase__apply_migration` avec le contenu du fichier `20260512000000_rls_initplan_batch.sql`.

- [ ] **Step 6: Vérifier en prod**

Via `mcp__plugin_supabase_supabase__get_advisors` : count `auth_rls_initplan` doit passer de ~41 à 0.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260512000000_rls_initplan_batch.sql
git commit -m "perf(db): RLS initplan batch - wrap auth calls dans (SELECT ...) sur ~41 policies"
```

---

### Task 6: Lister et indexer les FK manquants

**Files:**

- Create: `supabase/migrations/20260512000100_fk_indexes_batch.sql`

- [ ] **Step 1: Lister les FK sans index via advisor**

```sql
SELECT
  c.conrelid::regclass AS tbl,
  c.conname AS fk_name,
  array_agg(a.attname ORDER BY u.attnum) AS cols
FROM pg_constraint c
JOIN unnest(c.conkey) WITH ORDINALITY u(attnum, ord) ON true
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
WHERE c.contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid
      AND (i.indkey::int[])[0:array_length(c.conkey,1)-1] = c.conkey::int[]
  )
  AND c.connamespace = 'public'::regnamespace
GROUP BY c.conrelid, c.conname
ORDER BY tbl;
```

Via `mcp__plugin_supabase_supabase__execute_sql`.

- [ ] **Step 2: Écrire les CREATE INDEX**

Pour chaque résultat, écrire dans la migration :

```sql
CREATE INDEX IF NOT EXISTS idx_<table>_<col> ON public.<table> (<col>);
```

Note : pas de `CONCURRENTLY` dans une migration Supabase classique (transaction). Si le lock est un souci sur grosse table, soit faire un script séparé hors migration, soit accepter le lock court (les tables SOLUVIA sont petites < 100k lignes).

- [ ] **Step 3: Appliquer en local + prod**

Idem Task 5 steps 2-3 et 5-6.

- [ ] **Step 4: Vérifier le count avant/après**

Le count `unindexed_foreign_keys` advisor doit passer de 26 à 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260512000100_fk_indexes_batch.sql
git commit -m "perf(db): index sur 26 FK manquants (advisor unindexed_foreign_keys)"
```

---

## Phase 2 - Refacto data-table column header

### Task 7: API étendue + test loupe visible

**Files:**

- Modify: `components/shared/data-table/data-table-column-header.tsx`
- Test: `__tests__/data-table-column-header.test.tsx`

- [ ] **Step 1: Écrire le premier test**

Créer `__tests__/data-table-column-header.test.tsx` :

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTableColumnHeader } from '@/components/shared/data-table/data-table-column-header';

function mockColumn(overrides: Partial<any> = {}) {
  return {
    getCanSort: () => true,
    getIsSorted: () => false,
    toggleSorting: vi.fn(),
    getCanFilter: () => true,
    getFilterValue: () => undefined,
    setFilterValue: vi.fn(),
    ...overrides,
  } as any;
}

describe('DataTableColumnHeader', () => {
  it('rend la loupe quand filterVariant="text"', () => {
    render(
      <DataTableColumnHeader
        column={mockColumn()}
        title="Client"
        filterVariant="text"
      />,
    );
    expect(screen.getByLabelText('Filtrer par Client')).toBeInTheDocument();
  });

  it('ne rend PAS la loupe quand filterVariant absent (rétrocompat)', () => {
    render(<DataTableColumnHeader column={mockColumn()} title="Client" />);
    expect(screen.queryByLabelText('Filtrer par Client')).toBeNull();
  });
});
```

- [ ] **Step 2: Run, fails**

```bash
npm test -- data-table-column-header
```

Expected: FAIL (prop `filterVariant` n'existe pas).

- [ ] **Step 3: Étendre le composant**

Remplacer `components/shared/data-table/data-table-column-header.tsx` par :

```tsx
'use client';

import type { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FilterVariant = 'text' | 'select' | 'none';

interface DataTableColumnHeaderProps<TData, TValue> {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
  filterVariant?: FilterVariant;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
  filterVariant,
}: DataTableColumnHeaderProps<TData, TValue>) {
  const canSort = column.getCanSort();
  const showFilter =
    filterVariant && filterVariant !== 'none' && column.getCanFilter();

  if (!canSort && !showFilter) {
    return <div className={className}>{title}</div>;
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {canSort ? (
        <button
          className="flex items-center gap-1 text-xs font-semibold tracking-wider uppercase"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          aria-label={`Trier par ${title}`}
        >
          {title}
          {column.getIsSorted() === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : column.getIsSorted() === 'desc' ? (
            <ArrowDown className="h-3.5 w-3.5" />
          ) : (
            <ArrowUpDown className="text-muted-foreground h-3.5 w-3.5" />
          )}
        </button>
      ) : (
        <span className="text-xs font-semibold tracking-wider uppercase">
          {title}
        </span>
      )}
      {showFilter && (
        <button
          aria-label={`Filtrer par ${title}`}
          className="text-muted-foreground hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run, passes**

```bash
npm test -- data-table-column-header
```

Expected: PASS (2 tests).

- [ ] **Step 5: Vérifier zéro régression sur tables existantes**

```bash
npm run build && npm run lint
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add components/shared/data-table/data-table-column-header.tsx __tests__/data-table-column-header.test.tsx
git commit -m "feat(data-table): prop filterVariant + icone loupe (zero impact si non opt-in)"
```

---

### Task 8: Popover de recherche texte avec debounce

**Files:**

- Modify: `components/shared/data-table/data-table-column-header.tsx`
- Modify: `__tests__/data-table-column-header.test.tsx`

**Context:** On ajoute le popover et l'input. Le debounce vient de `hooks/use-debounce.ts` (existant). La normalisation accent vient de `lib/utils/search.ts:normalizeForSearch` (existant).

- [ ] **Step 1: Lire les utils existants pour confirmer l'API**

```bash
sed -n '1,30p' hooks/use-debounce.ts
sed -n '1,30p' lib/utils/search.ts
```

- [ ] **Step 2: Ajouter les tests**

Ajouter à `__tests__/data-table-column-header.test.tsx` :

```tsx
import { fireEvent, waitFor } from '@testing-library/react';

it('clic loupe ouvre un input de recherche', () => {
  render(
    <DataTableColumnHeader
      column={mockColumn()}
      title="Client"
      filterVariant="text"
    />,
  );
  fireEvent.click(screen.getByLabelText('Filtrer par Client'));
  expect(screen.getByPlaceholderText(/Rechercher Client/i)).toBeInTheDocument();
});

it('saisie debounce appelle setFilterValue apres 200ms', async () => {
  const setFilterValue = vi.fn();
  render(
    <DataTableColumnHeader
      column={mockColumn({ setFilterValue })}
      title="Client"
      filterVariant="text"
    />,
  );
  fireEvent.click(screen.getByLabelText('Filtrer par Client'));
  const input = screen.getByPlaceholderText(/Rechercher Client/i);
  fireEvent.change(input, { target: { value: 'acme' } });

  expect(setFilterValue).not.toHaveBeenCalled();
  await waitFor(() => expect(setFilterValue).toHaveBeenCalledWith('acme'), {
    timeout: 500,
  });
});

it('indicateur visuel actif quand getFilterValue retourne valeur', () => {
  render(
    <DataTableColumnHeader
      column={mockColumn({ getFilterValue: () => 'acme' })}
      title="Client"
      filterVariant="text"
    />,
  );
  expect(screen.getByTestId('filter-active-dot')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run, ça fail**

```bash
npm test -- data-table-column-header
```

Expected: FAIL sur 3 tests (popover/input/dot inexistants).

- [ ] **Step 4: Implémenter le popover**

Remplacer le bloc `{showFilter && (...)}` du Step 3 de Task 7 par :

```tsx
{
  showFilter && <TextFilterButton column={column} title={title} />;
}
```

Et ajouter en haut du même fichier :

```tsx
import { useEffect, useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';
```

Puis créer le sous-composant en bas du fichier :

```tsx
function TextFilterButton<TData, TValue>({
  column,
  title,
}: {
  column: Column<TData, TValue>;
  title: string;
}) {
  const current = (column.getFilterValue() as string | undefined) ?? '';
  const [value, setValue] = useState(current);
  const debounced = useDebounce(value, 200);
  const hasFilter = current.length > 0;

  useEffect(() => {
    column.setFilterValue(debounced || undefined);
  }, [debounced, column]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={`Filtrer par ${title}`}
          className="text-muted-foreground hover:text-foreground relative"
        >
          <Search className="h-3.5 w-3.5" />
          {hasFilter && (
            <span
              data-testid="filter-active-dot"
              className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-blue-500"
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <Input
          autoFocus
          placeholder={`Rechercher ${title}...`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 5: Run, passes**

```bash
npm test -- data-table-column-header
```

Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add components/shared/data-table/data-table-column-header.tsx __tests__/data-table-column-header.test.tsx
git commit -m "feat(data-table): popover de recherche texte avec debounce + indicateur actif"
```

---

### Task 9: Plugger un filterFn normalisé sur table Projets

**Files:**

- Modify: `components/projets/projet-list-columns.tsx` (colonnes client, cdp, typologie)
- Modify: `components/projets/projets-data-table.tsx` (config filterFns)

**Context:** Le composant header pose la recherche mais le filtrage effectif passe par `filterFn` côté TanStack. On utilise `normalizeForSearch` existant pour matcher sans accents.

- [ ] **Step 1: Inspecter le helper search existant**

```bash
sed -n '1,40p' lib/utils/search.ts
```

Vérifier la présence de `matchesSearch(value, query)` et `normalizeForSearch`. Confirmé dans les tests `__tests__/search.test.ts`.

- [ ] **Step 2: Ajouter un filterFn générique normalisé**

En haut de `components/projets/projet-list-columns.tsx`, ajouter :

```tsx
import { matchesSearch } from '@/lib/utils/search';

const textFilterFn = (row: any, columnId: string, filterValue: string) => {
  const cell = row.getValue(columnId);
  if (cell == null) return false;
  return matchesSearch(String(cell), filterValue);
};
```

- [ ] **Step 3: Opt-in 3 colonnes (Client, CDP, Typologie)**

Pour chacune de ces colonnes dans le tableau exporté, ajouter `filterVariant="text"` au header ET `filterFn: textFilterFn` ET `enableColumnFilter: true`. Exemple sur Client :

```tsx
{
  id: 'client',
  accessorFn: (row) => row.client?.raison_sociale ?? '',
  header: ({ column }) => (
    <DataTableColumnHeader
      column={column}
      title="Client"
      filterVariant="text"
    />
  ),
  cell: ({ row }) => { /* inchangé */ },
  enableColumnFilter: true,
  filterFn: textFilterFn,
},
```

Faire pareil pour `cdp` (`accessorFn` retourne `${prenom} ${nom}`) et `typologie` (déjà `row.typologie?.code`).

- [ ] **Step 4: Test visuel**

```bash
npm run dev
```

Aller sur `/projets`, cliquer la loupe à côté de "Client", taper "acm" - la table doit se filtrer.

- [ ] **Step 5: Build clean**

```bash
npm run build && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add components/projets/projet-list-columns.tsx
git commit -m "feat(projets): recherche par colonne (Client, CDP, Typologie) avec normalisation accents"
```

---

### Task 10: Réplication sur tables Factures et Commercial

**Files:**

- Modify: `components/facturation/facture-list-columns.tsx`
- Modify: `components/commercial/*-columns.tsx` (à confirmer le nom exact)

- [ ] **Step 1: Identifier les colonnes pertinentes Factures**

```bash
sed -n '1,80p' components/facturation/facture-list-columns.tsx
```

Cibler : Numéro facture (ref), Client (raison sociale), Projet (ref), Statut (filterVariant='select' à venir, sauter pour l'instant).

- [ ] **Step 2: Appliquer le même pattern**

Importer `matchesSearch` et `textFilterFn` (DRY : extraire `textFilterFn` dans `lib/utils/table-filters.ts` si utilisé 2+ fois).

Créer `lib/utils/table-filters.ts` :

```ts
import { matchesSearch } from '@/lib/utils/search';

export const textFilterFn = (
  row: { getValue: (id: string) => unknown },
  columnId: string,
  filterValue: string,
) => {
  const cell = row.getValue(columnId);
  if (cell == null) return false;
  return matchesSearch(String(cell), filterValue);
};
```

Puis importer dans projet-list-columns.tsx ET facture-list-columns.tsx.

- [ ] **Step 3: Opt-in colonnes Factures**

3 colonnes : ref, client, projet. Pattern identique Task 9.

- [ ] **Step 4: Build clean + visual test**

```bash
npm run build
npm run dev
```

Aller sur `/facturation`, vérifier que les 3 loupes apparaissent et filtrent.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/table-filters.ts components/projets/projet-list-columns.tsx components/facturation/facture-list-columns.tsx
git commit -m "feat(data-table): filter helper partage + recherche par colonne sur Factures"
```

- [ ] **Step 6: Idem Commercial**

Repérer le fichier columns du Commercial (`components/commercial/*-columns.tsx`) - si la liste prospects est rendue en table. Si c'est seulement Kanban aujourd'hui, sauter cette étape (la table Commercial sera créée en Task 17).

---

## Phase 3 - Features Production + Commercial

### Task 11: Extraire les sous-vues de production-page-client.tsx

**Files:**

- Modify: `components/production/production-page-client.tsx` (passe de 999 à ~300 lignes)
- Create: `components/production/views/monthly-view.tsx`
- Create: `components/production/views/by-projet-view.tsx`
- Create: `components/production/views/by-client-view.tsx`
- Create: `components/production/views/chart-view.tsx`
- Create: `components/production/views/build-display-data.ts` (helper pur)

**Context:** Le fichier 999 lignes mélange UI, calculs, et toggle de vues. On extrait. Pas de changement comportemental ici, juste split.

- [ ] **Step 1: Lire le fichier complet pour repérer les frontières**

```bash
cat components/production/production-page-client.tsx | head -200
sed -n '200,500p' components/production/production-page-client.tsx
sed -n '500,999p' components/production/production-page-client.tsx
```

Identifier visuellement : helpers `buildDisplayData`, JSX de la vue mensuelle, JSX par-client, JSX par-projet, JSX chart, le toggle perspective, le filtre client.

- [ ] **Step 2: Extraire `buildDisplayData` dans un fichier pur**

Créer `components/production/views/build-display-data.ts` avec la fonction `buildDisplayData` et le type `MonthRow`. Aucune dépendance React/UI - juste `date-fns`.

- [ ] **Step 3: Extraire chaque JSX de vue dans son propre composant**

Pour chaque vue (mensuel, par-projet, par-client, chart), créer le `.tsx` correspondant. Props : `data: MonthRow[]`, `perspective: 'opco' | 'soluvia'`, callbacks éventuels.

- [ ] **Step 4: Réduire production-page-client.tsx au shell**

Le client retient : state (perspective, vue active, filtre client), les calculs `useMemo`, et le rendu conditionnel `{view === 'mensuel' && <MonthlyView ... />}`.

- [ ] **Step 5: Build + visual non-régression**

```bash
npm run build
npm run dev
```

Sur `/production`, tester chaque onglet/vue : valeurs identiques à avant. Aucun écart numérique.

- [ ] **Step 6: Commit**

```bash
git add components/production/
git commit -m "refactor(production): split en 4 sous-vues + helper pur (999 -> ~300 lignes)"
```

---

### Task 12: Ajouter le 3ᵉ mode "consolidé" OPCO + Soluvia

**Files:**

- Modify: `components/production/views/build-display-data.ts`
- Modify: `components/production/views/monthly-view.tsx`
- Modify: `components/production/views/by-projet-view.tsx`
- Modify: `components/production/views/by-client-view.tsx`
- Modify: `components/production/production-page-client.tsx` (ajout du toggle)

- [ ] **Step 1: Étendre buildDisplayData pour retourner 2 perspectives**

Nouveau type :

```ts
export interface ConsolidatedMonthRow {
  mois: string;
  label: string;
  // OPCO
  productionOpco: number;
  factureOpco: number;
  encaisseOpco: number;
  enRetardOpco: number;
  // SOLUVIA
  productionSoluvia: number;
  factureSoluvia: number;
  encaisseSoluvia: number;
  enRetardSoluvia: number;
  isCurrent: boolean;
  isFuture: boolean;
}

export function buildConsolidatedDisplayData(
  data: ProductionRow[],
): ConsolidatedMonthRow[] {
  // Réutilise la même logique de scaling que buildDisplayData,
  // mais retient les 2 valeurs (raw OPCO + scaled Soluvia) par mois.
}
```

- [ ] **Step 2: Ajouter le mode dans le toggle perspective**

Dans `production-page-client.tsx`, le state `perspective` accepte maintenant `'opco' | 'soluvia' | 'consolide'`. UI : 3 onglets ou un select.

- [ ] **Step 3: Adapter monthly-view pour le mode consolidé**

Quand `perspective === 'consolide'`, afficher 2 séries de colonnes côte à côte : "Production OPCO | SOLUVIA", "Facture OPCO | SOLUVIA", etc. Header avec sous-groupements.

- [ ] **Step 4: Idem by-projet / by-client**

Mêmes principes : 2 colonnes parallèles dans le mode consolidé.

- [ ] **Step 5: Chart view**

Le chart affiche 2 séries superposées (OPCO en clair, SOLUVIA en foncé) au lieu d'une.

- [ ] **Step 6: Build + visual test**

```bash
npm run build && npm run dev
```

Sur `/production`, basculer entre les 3 modes. Vérifier que les totaux des colonnes "OPCO" en consolidé == valeurs en mode "opco" seul, et idem pour Soluvia.

- [ ] **Step 7: Commit**

```bash
git add components/production/
git commit -m "feat(production): 3eme mode consolide OPCO + Soluvia cote a cote"
```

---

### Task 13: Filtre projet multi-select

**Files:**

- Modify: `components/production/production-page-client.tsx`
- Possibly: `lib/queries/production.ts` (si la query ne retourne pas déjà projet par ligne)

- [ ] **Step 1: Vérifier que la query retourne le projet**

```bash
sed -n '1,80p' lib/queries/production.ts
```

Si `ProductionRow` n'a pas `projet_id` ou `projet_ref`, étendre la query (la table `factures` a `projet_id`, donc trivial).

- [ ] **Step 2: Ajouter le filtre dans le client**

Calquer le composant filtre client existant (dropdown checkbox). Récupérer la liste des projets distincts depuis `data`, dédup. Sélection multiple, "tout cocher / tout décocher" en tête.

```tsx
const [filterProjets, setFilterProjets] = useState<string[]>([]);
const projetsAvailable = useMemo(
  () => Array.from(new Set(data.map((r) => r.projetRef))).sort(),
  [data],
);
const filteredData = useMemo(
  () =>
    filterProjets.length === 0
      ? data
      : data.filter((r) => filterProjets.includes(r.projetRef)),
  [data, filterProjets],
);
```

- [ ] **Step 3: Propager `filteredData` à toutes les vues**

Toutes les vues consomment `filteredData` au lieu de `data`. Vérifier que les totaux mensuels recalculent correctement.

- [ ] **Step 4: URL search params (partage de lien)**

State persisté dans `?projets=ref1,ref2` via `useSearchParams` + `router.replace`. Si l'URL contient `projets=`, hydrater le state au mount.

```tsx
const sp = useSearchParams();
const router = useRouter();
const pathname = usePathname();

useEffect(() => {
  const fromUrl = sp.get('projets');
  if (fromUrl) setFilterProjets(fromUrl.split(','));
}, []); // mount only

useEffect(() => {
  const next = new URLSearchParams(sp);
  if (filterProjets.length === 0) next.delete('projets');
  else next.set('projets', filterProjets.join(','));
  router.replace(`${pathname}?${next.toString()}`, { scroll: false });
}, [filterProjets, pathname, router, sp]);
```

- [ ] **Step 5: Build + visual test**

Cocher 2 projets → toutes les vues filtrées. Recharger la page → filtres préservés via URL.

- [ ] **Step 6: Commit**

```bash
git add components/production/
git commit -m "feat(production): filtre projet multi-select propage aux 4 vues + URL params"
```

---

### Task 14: Commercial vue Tableau (toggle Kanban/Table)

**Files:**

- Create: `components/commercial/pipeline-table.tsx`
- Modify: `components/commercial/pipeline-board.tsx` (le contenu reste, on l'enveloppe)
- Modify: `app/(dashboard)/commercial/page.tsx` ou wrapper client

- [ ] **Step 1: Lire la structure actuelle**

```bash
sed -n '1,80p' components/commercial/pipeline-board.tsx
```

Identifier les props (`prospects: Prospect[]`, `stages: Stage[]`, etc.) et le type `Prospect`.

- [ ] **Step 2: Créer le composant Table**

`components/commercial/pipeline-table.tsx` :

```tsx
'use client';

import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import { textFilterFn } from '@/lib/utils/table-filters';
import { StatusBadge } from '@/components/shared/status-badge';
import type { Prospect } from '@/lib/queries/prospects';

interface PipelineTableProps {
  prospects: Prospect[];
  onRowClick: (p: Prospect) => void;
}

export function PipelineTable({ prospects, onRowClick }: PipelineTableProps) {
  const columns: ColumnDef<Prospect>[] = [
    {
      accessorKey: 'raison_sociale',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Prospect"
          filterVariant="text"
        />
      ),
      filterFn: textFilterFn,
      enableColumnFilter: true,
    },
    {
      accessorKey: 'contact_nom',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Contact"
          filterVariant="text"
        />
      ),
      cell: ({ row }) =>
        `${row.original.contact_nom ?? ''} ${row.original.contact_email ?? ''}`.trim(),
      filterFn: textFilterFn,
      enableColumnFilter: true,
    },
    {
      accessorKey: 'stage',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Stage" />
      ),
      cell: ({ row }) => (
        <StatusBadge
          label={row.original.stage_label ?? '-'}
          color={row.original.stage_color ?? 'gray'}
        />
      ),
    },
    {
      accessorKey: 'days_in_stage',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Jours stage" />
      ),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.days_in_stage ?? '-'}
        </span>
      ),
    },
    {
      accessorKey: 'next_rdv_date',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Prochain RDV" />
      ),
      cell: ({ row }) => row.original.next_rdv_date ?? '-',
    },
    {
      accessorKey: 'commercial_nom',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Commercial"
          filterVariant="text"
        />
      ),
      filterFn: textFilterFn,
      enableColumnFilter: true,
    },
  ];

  return (
    <DataTable columns={columns} data={prospects} onRowClick={onRowClick} />
  );
}
```

**Note**: les noms exacts des champs (`stage_label`, `days_in_stage`, etc.) sont à adapter au type `Prospect` réel - lire `lib/queries/prospects.ts` pour confirmer.

- [ ] **Step 3: Ajouter le toggle Kanban/Table dans la page**

Repérer le composant client racine de `/commercial` (probablement `components/commercial/commercial-page-client.tsx` ou directement le pipeline-board). Ajouter un toggle en tête :

```tsx
const [view, setView] = useState<'kanban' | 'table'>(() => {
  if (typeof window === 'undefined') return 'kanban';
  return (localStorage.getItem('commercial_view') as 'kanban' | 'table') ?? 'kanban';
});

useEffect(() => {
  localStorage.setItem('commercial_view', view);
}, [view]);

// UI :
<ToggleGroup value={view} onValueChange={setView}>
  <ToggleGroupItem value="kanban">Kanban</ToggleGroupItem>
  <ToggleGroupItem value="table">Tableau</ToggleGroupItem>
</ToggleGroup>

{view === 'kanban' ? <PipelineBoard ... /> : <PipelineTable prospects={prospects} onRowClick={...} />}
```

- [ ] **Step 4: Build + visual test**

```bash
npm run build && npm run dev
```

Sur `/commercial`, toggle Kanban ↔ Tableau. Vérifier que le clic sur une ligne ouvre la sheet detail.

- [ ] **Step 5: Commit**

```bash
git add components/commercial/ components/<page-client>.tsx
git commit -m "feat(commercial): vue Tableau alternative au Kanban (toggle localStorage)"
```

---

## Phase 4b - Multi-permissive policies lot 1

### Task 15: Analyser les policies multi-permissive sur projets/clients/contrats

**Files:**

- Investigate via SQL

- [ ] **Step 1: Lister les policies sur les 3 tables**

```sql
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('projets', 'clients', 'contrats')
ORDER BY tablename, cmd, policyname;
```

Via `mcp__plugin_supabase_supabase__execute_sql`.

- [ ] **Step 2: Identifier les doublons par (table, role, cmd)**

Repérer les couples (table, cmd, role) qui ont >1 policy permissive. Exemple : `projets / SELECT / authenticated` avec 3 policies "admin_can_select", "cdp_can_select_own", "commercial_can_select".

Documenter le résultat dans `tmp/multipermissive-lot1.md` (non commité) avec le plan de consolidation : 1 policy par couple, avec qual = `(policy1_qual) OR (policy2_qual) OR (policy3_qual)`.

---

### Task 16: Écrire la migration consolidée pour lot 1

**Files:**

- Create: `supabase/migrations/20260512000200_multipermissive_lot1.sql`

- [ ] **Step 1: Générer le SQL**

Pour chaque table du lot 1, pour chaque couple (cmd, role) avec >1 policy :

```sql
-- Lot 1 : projets / SELECT / authenticated
DROP POLICY IF EXISTS "admin_can_select" ON public.projets;
DROP POLICY IF EXISTS "cdp_can_select_own" ON public.projets;
DROP POLICY IF EXISTS "commercial_can_select" ON public.projets;

CREATE POLICY "projets_select_consolidated" ON public.projets
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR (cdp_id = (SELECT auth.uid()) OR backup_cdp_id = (SELECT auth.uid()))
    OR (SELECT public.is_commercial())
  );
```

**Important :** appliquer DIRECTEMENT le pattern RLS initplan (wrapping) en consolidant, comme ça les 2 lints sont traités d'un coup pour ces tables.

- [ ] **Step 2: Appliquer en local + tests pgTAP**

```bash
npx supabase db reset --local && npx supabase db push --local
npx supabase test db
```

Expected: tests verts. Si un test pgTAP échoue, c'est probablement une condition manquée dans la consolidation - revoir.

- [ ] **Step 3: Test manuel des 3 rôles via SQL**

```sql
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "<admin-uuid>", "role": "authenticated"}';
SELECT count(*) FROM public.projets; -- doit être total
RESET role;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "<cdp-uuid>", "role": "authenticated"}';
SELECT count(*) FROM public.projets; -- doit être projets de ce CDP uniquement
RESET role;
```

- [ ] **Step 4: Appliquer en prod via MCP**

- [ ] **Step 5: Vérifier advisor**

Count `multiple_permissive_policies` doit baisser proportionnellement au nombre de policies consolidées dans lot 1 (typiquement 20-40 sur 329).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260512000200_multipermissive_lot1.sql
git commit -m "perf(db): consolidate multipermissive policies lot 1 (projets/clients/contrats)"
```

---

## Finalisation

### Task 17: Push et vérification globale prod

- [ ] **Step 1: Pull dernières mises à jour**

```bash
git fetch origin && git status
```

Si conflits : résoudre. Sinon continuer.

- [ ] **Step 2: Run tous les tests une dernière fois**

```bash
npm test
```

Expected: tous verts.

- [ ] **Step 3: Build de prod local**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 4: Push**

```bash
git push origin main
```

- [ ] **Step 5: Attendre déploiement Vercel READY**

Via `mcp__plugin_vercel_vercel__list_deployments` ou `vercel inspect`.

- [ ] **Step 6: Smoke test sur app.mysoluvia.com**

Parcours rapide :

- `/projets` : colonne Commission cliquable, loupe sur Client/CDP/Typologie
- `/facturation` : loupes opérationnelles
- `/production` : 3 modes (OPCO/Soluvia/consolidé), filtre projet
- `/commercial` : toggle Kanban/Tableau, recherche sur Tableau

- [ ] **Step 7: Vérifier advisor final**

`mcp__plugin_supabase_supabase__get_advisors type=performance` :

- `auth_rls_initplan` : ~0
- `unindexed_foreign_keys` : 0
- `multiple_permissive_policies` : baisse significative

- [ ] **Step 8: Mettre à jour la mémoire**

Écrire dans `~/.claude/projects/-Users-nael-Desktop-SOLUVIAV2/memory/project_progress.md` un snapshot daté de ce push.

---

## Résumé tasks

| #   | Task                                   | Phase | Durée estimée |
| --- | -------------------------------------- | ----- | ------------- |
| 1   | Audit 404 CDP                          | 1     | 10min         |
| 2   | Colonne Commission cliquable           | 1     | 10min         |
| 3   | Helper TTC inclus + tests              | 1     | 30min         |
| 4   | Lister RLS initplan                    | 4a    | 15min         |
| 5   | Migration RLS initplan batch           | 4a    | 45min         |
| 6   | Migration FK indexes                   | 4a    | 30min         |
| 7   | API filterVariant + loupe              | 2     | 30min         |
| 8   | Popover recherche debounce             | 2     | 45min         |
| 9   | Opt-in Projets                         | 2     | 30min         |
| 10  | Réplication Factures + helper partagé  | 2     | 30min         |
| 11  | Split production-page-client (refacto) | 3     | 1h30          |
| 12  | Mode consolidé OPCO + Soluvia          | 3     | 1h            |
| 13  | Filtre projet multi-select + URL       | 3     | 45min         |
| 14  | Commercial vue Tableau                 | 3     | 1h            |
| 15  | Analyser multi-permissive lot 1        | 4b    | 30min         |
| 16  | Migration consolidation lot 1          | 4b    | 45min         |
| 17  | Finalisation + smoke test              | -     | 30min         |

**Total estimé** : ~10-11h d'exécution effective. Tient sur 2 jours pleins ou 3-4 ½ journées.
