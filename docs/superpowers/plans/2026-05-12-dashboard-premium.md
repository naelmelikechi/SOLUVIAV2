# Dashboard premium - refonte hierarchie d'insight - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre `/dashboard` en pattern Trinity Funnel + chips actionnables + mini-cards uniformes, en calant tous les financiers sur le mois en cours (ou periode selectionnee).

**Architecture:** 5 nouveaux composants atomiques (TrinityFunnel, ContextChips, AlertsStrip, MiniKpiCard, PeriodSelector) + adaptation de `getDashboardFinancials` pour accepter une periode + rewrite de `DashboardPageClient`.

**Tech Stack:** Next.js 16 (App Router), React Server Components, TypeScript, shadcn/ui (base-ui), Tailwind 4, Supabase, vitest + jsdom (tests UI).

**Reference spec:** `docs/superpowers/specs/2026-05-12-dashboard-premium-design.md`

---

## File Structure

**Modified files :**

- `lib/queries/dashboard.ts` - `getDashboardFinancials(periode?)`, ajout `totalAFacturer`
- `app/(dashboard)/dashboard/page.tsx` - lecture `searchParams.periode`, passe range aux queries
- `components/dashboard/dashboard-page-client.tsx` - rewrite structurel
- `app/globals.css` - utilitaire `.num` (tabular-nums + slashed-zero)

**Nouveaux fichiers :**

- `components/dashboard/period-selector.tsx`
- `components/dashboard/alerts-strip.tsx`
- `components/dashboard/trinity-funnel.tsx`
- `components/dashboard/context-chips.tsx`
- `components/dashboard/mini-kpi-card.tsx`
- `lib/utils/dashboard-periode.ts` - helper resolvePeriode(label) -> { from, to }

**Tests :**

- `__tests__/dashboard-queries.test.ts` - etendu pour la periode
- `__tests__/dashboard-periode.test.ts` - resolvePeriode
- `__tests__/dashboard-trinity-funnel.test.tsx`
- `__tests__/dashboard-context-chips.test.tsx`
- `__tests__/dashboard-mini-kpi-card.test.tsx`
- `__tests__/dashboard-alerts-strip.test.tsx`
- `__tests__/dashboard-period-selector.test.tsx`

**Fichiers possiblement supprimes (post-migration, Task 14) :**

- Personal Time Widget inline (etait dans `dashboard-page-client.tsx`)
- Vieux bloc Alerts inline (idem)
- `KpiCard` interne - garde si encore utilise ailleurs, sinon supprime

---

## Phase 1 - Data layer (periode + totalAFacturer)

### Task 1 : Helper `resolvePeriode` (mois courant / precedent / 30j roulants)

**Files:**

- Create: `lib/utils/dashboard-periode.ts`
- Test: `__tests__/dashboard-periode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/dashboard-periode.test.ts
import { describe, it, expect } from 'vitest';
import { resolvePeriode, type PeriodeKey } from '@/lib/utils/dashboard-periode';

describe('resolvePeriode', () => {
  const ref = new Date('2026-05-12T10:00:00Z');

  it('returns first/last day of current month for ce_mois', () => {
    const r = resolvePeriode('ce_mois', ref);
    expect(r.from.toISOString().slice(0, 10)).toBe('2026-05-01');
    expect(r.to.toISOString().slice(0, 10)).toBe('2026-05-31');
    expect(r.label).toBe('Mai 2026');
  });

  it('returns previous month for mois_precedent', () => {
    const r = resolvePeriode('mois_precedent', ref);
    expect(r.from.toISOString().slice(0, 10)).toBe('2026-04-01');
    expect(r.to.toISOString().slice(0, 10)).toBe('2026-04-30');
    expect(r.label).toBe('Avril 2026');
  });

  it('returns 30 days rolling window for 30j', () => {
    const r = resolvePeriode('30j', ref);
    expect(r.from.toISOString().slice(0, 10)).toBe('2026-04-12');
    expect(r.to.toISOString().slice(0, 10)).toBe('2026-05-12');
    expect(r.label).toBe('30 derniers jours');
  });

  it('defaults to ce_mois for unknown key', () => {
    const r = resolvePeriode('garbage' as PeriodeKey, ref);
    expect(r.label).toBe('Mai 2026');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/dashboard-periode.test.ts`
Expected: FAIL "Cannot find module '@/lib/utils/dashboard-periode'"

- [ ] **Step 3: Implement helper**

```ts
// lib/utils/dashboard-periode.ts
import { startOfMonth, endOfMonth, subMonths, subDays, format } from 'date-fns';
import { fr } from 'date-fns/locale';

export type PeriodeKey = 'ce_mois' | 'mois_precedent' | '30j';

export interface Periode {
  key: PeriodeKey;
  from: Date;
  to: Date;
  label: string;
}

export function resolvePeriode(
  key: PeriodeKey,
  ref: Date = new Date(),
): Periode {
  switch (key) {
    case 'mois_precedent': {
      const prev = subMonths(ref, 1);
      return {
        key: 'mois_precedent',
        from: startOfMonth(prev),
        to: endOfMonth(prev),
        label: capitalize(format(prev, 'MMMM yyyy', { locale: fr })),
      };
    }
    case '30j':
      return {
        key: '30j',
        from: subDays(ref, 30),
        to: ref,
        label: '30 derniers jours',
      };
    case 'ce_mois':
    default:
      return {
        key: 'ce_mois',
        from: startOfMonth(ref),
        to: endOfMonth(ref),
        label: capitalize(format(ref, 'MMMM yyyy', { locale: fr })),
      };
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/dashboard-periode.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/utils/dashboard-periode.ts __tests__/dashboard-periode.test.ts
git commit -m "feat(dashboard): helper resolvePeriode pour mois courant/precedent/30j"
```

---

### Task 2 : `getDashboardFinancials` accepte une periode

**Files:**

- Modify: `lib/queries/dashboard.ts`
- Test: `__tests__/dashboard-queries.test.ts` (etendu)

Cette task ajoute un parametre optionnel `periode` aux queries. Quand fourni :

- `totalFacture` filtre `factures.date_emission BETWEEN periode.from AND periode.to`
- `totalEncaisse` filtre `paiements.date_paiement BETWEEN periode.from AND periode.to`
- `totalProduction` filtre sur le `monthKey` calcule depuis `periode.from`
- `totalEnRetard` reste cumul a date (encours, non periodise)

- [ ] **Step 1: Write the failing test**

```ts
// Append to __tests__/dashboard-queries.test.ts a new describe block:

describe('getDashboardFinancials(periode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passe les filtres date_emission/date_paiement quand periode fournie', async () => {
    const queries: Array<{ table: string; filters: FilterRecord[] }> = [];
    const supabaseMock = buildSupabase(
      {
        factures: () => ({ data: [], error: null }),
        paiements: () => ({ data: [], error: null }),
        contrats: () => ({ data: [], error: null }),
        saisies_temps: () => ({ data: [], error: null }),
        users: () => ({ data: [], error: null }),
        jours_feries: () => ({ data: [], error: null }),
      },
      queries,
    );
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      supabaseMock,
    );

    const { getDashboardFinancials } = await import('@/lib/queries/dashboard');
    const periode = {
      from: new Date('2026-05-01'),
      to: new Date('2026-05-31'),
    };
    await getDashboardFinancials(periode);

    const factureQuery = queries.find(
      (q) =>
        q.table === 'factures' &&
        q.filters.some((f) => f.col === 'date_emission' && f.op === 'gte'),
    );
    expect(factureQuery).toBeDefined();

    const paiementQuery = queries.find(
      (q) =>
        q.table === 'paiements' &&
        q.filters.some((f) => f.col === 'date_paiement' && f.op === 'gte'),
    );
    expect(paiementQuery).toBeDefined();
  });

  it('omet les filtres periode quand parametre absent (compat actuelle)', async () => {
    const queries: Array<{ table: string; filters: FilterRecord[] }> = [];
    const supabaseMock = buildSupabase(
      {
        factures: () => ({ data: [], error: null }),
        paiements: () => ({ data: [], error: null }),
        contrats: () => ({ data: [], error: null }),
        saisies_temps: () => ({ data: [], error: null }),
        users: () => ({ data: [], error: null }),
        jours_feries: () => ({ data: [], error: null }),
      },
      queries,
    );
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      supabaseMock,
    );

    const { getDashboardFinancials } = await import('@/lib/queries/dashboard');
    await getDashboardFinancials();

    const dateFilters = queries
      .flatMap((q) => q.filters)
      .filter((f) => f.col === 'date_emission' || f.col === 'date_paiement');
    expect(dateFilters).toHaveLength(0);
  });
});
```

(Note: `buildSupabase` doit accepter un parametre `queries` pour tracer. Si la signature actuelle ne le supporte pas, adapter ou mocker localement.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/dashboard-queries.test.ts -t "getDashboardFinancials\\(periode\\)"`
Expected: FAIL "factureQuery is undefined" ou erreur de typing sur le parametre

- [ ] **Step 3: Adapt query signature in `lib/queries/dashboard.ts`**

Modifier la signature et la logique :

```ts
// Au sommet du fichier, ajouter import :
import type { Periode } from '@/lib/utils/dashboard-periode';

// Modifier la signature :
export async function getDashboardFinancials(
  periode?: Periode,
): Promise<DashboardFinancials> {
  const supabase = await createClient();
  const now = new Date();
  // ... (calculs existants pour week/month boundaries)

  const monthKey = periode
    ? format(periode.from, 'yyyy-MM')
    : format(now, 'yyyy-MM');

  // ---- Construire les queries factures et paiements avec filtre periode optionnel ----
  let facturesQuery = supabase
    .from('factures')
    .select(
      'montant_ht, statut, date_emission, projet:projets!factures_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
    )
    .in('statut', ['emise', 'payee', 'en_retard', 'avoir'])
    .eq('projet.client.is_demo', false)
    .eq('projet.client.archive', false);

  if (periode) {
    facturesQuery = facturesQuery
      .gte('date_emission', format(periode.from, 'yyyy-MM-dd'))
      .lte('date_emission', format(periode.to, 'yyyy-MM-dd'));
  }

  let paiementsQuery = supabase
    .from('paiements')
    .select(
      'montant, date_paiement, facture:factures!paiements_facture_id_fkey!inner(projet:projets!factures_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive)))',
    )
    .eq('facture.projet.client.is_demo', false)
    .eq('facture.projet.client.archive', false);

  if (periode) {
    paiementsQuery = paiementsQuery
      .gte('date_paiement', format(periode.from, 'yyyy-MM-dd'))
      .lte('date_paiement', format(periode.to, 'yyyy-MM-dd'));
  }

  // Remplacer les deux Premieres entrees du Promise.all :
  // - supabase.from('factures').select(...)... => facturesQuery
  // - supabase.from('paiements').select(...)... => paiementsQuery
```

Puis remplacer les deux Premieres entrees du `Promise.all` initial par `facturesQuery` et `paiementsQuery`. La 3eme entree (`facturesRetardRes` pour totalEnRetard) reste **inchangee** (cumul a date).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/dashboard-queries.test.ts`
Expected: PASS (tests existants + 2 nouveaux)

- [ ] **Step 5: Verifier que rien n'est casse cote types**

Run: `npx tsc --noEmit`
Expected: pas d'erreur

- [ ] **Step 6: Commit**

```bash
git add lib/queries/dashboard.ts __tests__/dashboard-queries.test.ts
git commit -m "feat(dashboard): getDashboardFinancials accepte une periode (filtre date_emission/date_paiement)"
```

---

### Task 3 : Ajouter `totalAFacturer` (€ des echeances pretes a emettre)

**Files:**

- Modify: `lib/queries/dashboard.ts` (interface + query)
- Test: `__tests__/dashboard-queries.test.ts`

Aujourd'hui `data.echeancesAFacturer` est un **count** (`echeancesRes.data?.length`). On ajoute un nouveau champ `totalAFacturer: number` dans `DashboardFinancials` qui somme `montant_ht` des echeances non liees a une facture, non validees, dont la date d'echeance est <= today.

- [ ] **Step 1: Write the failing test**

```ts
// Append to __tests__/dashboard-queries.test.ts dans describe('getDashboardFinancials(periode)')

it('totalAFacturer = somme montant_ht des echeances pretes', async () => {
  const supabaseMock = buildSupabase({
    factures: () => ({ data: [], error: null }),
    paiements: () => ({ data: [], error: null }),
    contrats: () => ({ data: [], error: null }),
    saisies_temps: () => ({ data: [], error: null }),
    users: () => ({ data: [], error: null }),
    jours_feries: () => ({ data: [], error: null }),
    echeances: () => ({
      data: [{ montant_ht: 1500.5 }, { montant_ht: 2000 }, { montant_ht: 100 }],
      error: null,
    }),
  });
  (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    supabaseMock,
  );

  const { getDashboardFinancials } = await import('@/lib/queries/dashboard');
  const result = await getDashboardFinancials();
  expect(result.totalAFacturer).toBe(3600.5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/dashboard-queries.test.ts -t "totalAFacturer"`
Expected: FAIL "result.totalAFacturer is undefined"

- [ ] **Step 3: Add query and field**

Dans `lib/queries/dashboard.ts` :

1. Etendre l'interface :

```ts
export interface DashboardFinancials {
  // ... champs existants
  totalAFacturer: number; // € des echeances pretes a emettre (facture_id null, validee false, date <= today)
}
```

2. Ajouter la query dans le `Promise.all` de `getDashboardFinancials` :

```ts
// Echeances pretes a emettre (montants en € pour le chip "A facturer")
supabase
  .from('echeances')
  .select(
    'montant_ht, projet:projets!echeances_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
  )
  .is('facture_id', null)
  .eq('validee', false)
  .lte('date_echeance', format(now, 'yyyy-MM-dd'))
  .eq('projet.client.is_demo', false)
  .eq('projet.client.archive', false),
```

3. Capturer le resultat (variable `echeancesAFacturerRes`) et calculer :

```ts
const totalAFacturer =
  Math.round(
    (echeancesAFacturerRes.data ?? []).reduce(
      (sum, e) => sum + Number(e.montant_ht ?? 0),
      0,
    ) * 100,
  ) / 100;
```

4. Retourner `totalAFacturer` dans l'objet final.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/dashboard-queries.test.ts -t "totalAFacturer"`
Expected: PASS

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: pas d'erreur

- [ ] **Step 6: Commit**

```bash
git add lib/queries/dashboard.ts __tests__/dashboard-queries.test.ts
git commit -m "feat(dashboard): totalAFacturer (€) pour chip 'A facturer'"
```

---

### Task 4 : Page passe `searchParams.periode` aux queries

**Files:**

- Modify: `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Lire le fichier actuel**

Run: `cat app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 2: Adapter la signature pour accepter searchParams**

Remplacer le contenu par :

```tsx
import type { Metadata } from 'next';
import {
  getDashboardData,
  getDashboardFinancials,
  getKpiSnapshots,
  getMonthlyTrend,
  getInvoiceStatusBreakdown,
  getUserWeekHours,
} from '@/lib/queries/dashboard';
import { PageHeader } from '@/components/shared/page-header';
import { DashboardPageClient } from '@/components/dashboard/dashboard-page-client';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { resolvePeriode, type PeriodeKey } from '@/lib/utils/dashboard-periode';
import { format, startOfMonth, addMonths } from 'date-fns';

export const metadata: Metadata = { title: 'Tableau de bord - SOLUVIA' };
export const revalidate = 30;

const VALID_PERIODES: PeriodeKey[] = ['ce_mois', 'mois_precedent', '30j'];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const params = await searchParams;
  const periodeKey: PeriodeKey =
    params.periode && VALID_PERIODES.includes(params.periode as PeriodeKey)
      ? (params.periode as PeriodeKey)
      : 'ce_mois';

  const now = new Date();
  const periode = resolvePeriode(periodeKey, now);
  // Snapshot M-1 toujours base sur le mois precedent du mois courant
  const previousMonth = format(startOfMonth(addMonths(now, -1)), 'yyyy-MM-dd');

  const [
    data,
    financials,
    previousKpis,
    monthlyTrend,
    invoiceBreakdown,
    weekHours,
  ] = await Promise.all([
    getDashboardData(),
    getDashboardFinancials(periode),
    getKpiSnapshots(previousMonth),
    getMonthlyTrend(),
    getInvoiceStatusBreakdown(),
    getUserWeekHours(),
  ]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="KPIs et alertes operationnelles"
      >
        <PeriodSelector current={periodeKey} label={periode.label} />
      </PageHeader>
      <DashboardPageClient
        data={data}
        financials={financials}
        previousKpis={previousKpis}
        monthlyTrend={monthlyTrend}
        invoiceBreakdown={invoiceBreakdown}
        weekHours={weekHours}
        periode={periode}
      />
    </div>
  );
}
```

(`PeriodSelector` n'existe pas encore - le build casse, on l'implemente en Task 5. `DashboardPageClient` accepte `periode` qu'on cablera plus tard.)

- [ ] **Step 3: Verifier que TypeScript casse comme attendu**

Run: `npx tsc --noEmit`
Expected: erreurs sur `PeriodSelector` et la prop `periode` sur `DashboardPageClient` (resolues plus tard)

**Note:** Pas de commit ici. La modif sera commitee avec Task 5 (PeriodSelector) pour garder le repo green entre commits.

---

## Phase 2 - Composants atomiques (TDD)

### Task 5 : `PeriodSelector` (Select shadcn + URL update)

**Files:**

- Create: `components/dashboard/period-selector.tsx`
- Test: `__tests__/dashboard-period-selector.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/dashboard-period-selector.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PeriodSelector } from '@/components/dashboard/period-selector';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(''),
}));

describe('PeriodSelector', () => {
  it('affiche le label fourni', () => {
    render(<PeriodSelector current="ce_mois" label="Mai 2026" />);
    expect(screen.getByText('Mai 2026')).toBeDefined();
  });

  it('liste les 3 options', () => {
    render(<PeriodSelector current="ce_mois" label="Mai 2026" />);
    const btn = screen.getByRole('button');
    btn.click();
    expect(screen.getByText('Ce mois')).toBeDefined();
    expect(screen.getByText('Mois precedent')).toBeDefined();
    expect(screen.getByText('30 derniers jours')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/dashboard-period-selector.test.tsx`
Expected: FAIL "Cannot find module ..."

- [ ] **Step 3: Implement component**

```tsx
// components/dashboard/period-selector.tsx
'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { PeriodeKey } from '@/lib/utils/dashboard-periode';

const OPTIONS: { key: PeriodeKey; label: string }[] = [
  { key: 'ce_mois', label: 'Ce mois' },
  { key: 'mois_precedent', label: 'Mois precedent' },
  { key: '30j', label: '30 derniers jours' },
];

export function PeriodSelector({
  current,
  label,
}: {
  current: PeriodeKey;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const select = (key: PeriodeKey) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === 'ce_mois') params.delete('periode');
    else params.set('periode', key);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border-border hover:bg-accent inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {label}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div
          role="listbox"
          className="bg-popover border-border absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-md border shadow-md"
        >
          {OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => select(opt.key)}
              className={cn(
                'hover:bg-accent w-full px-3 py-1.5 text-left text-xs',
                opt.key === current && 'bg-accent font-semibold',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/dashboard-period-selector.test.tsx`
Expected: PASS

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: erreurs restantes uniquement sur la prop `periode` de `DashboardPageClient`

- [ ] **Step 6: Commit Tasks 4 + 5**

```bash
git add app/\(dashboard\)/dashboard/page.tsx components/dashboard/period-selector.tsx __tests__/dashboard-period-selector.test.tsx
git commit -m "feat(dashboard): selecteur de periode (ce mois / precedent / 30j) via searchParams"
```

(`DashboardPageClient` n'a pas encore la prop `periode` typee mais comme c'est utilise dans page.tsx, il faut au minimum elargir le type. Ajouter une prop optionnelle ignoree temporairement dans `DashboardPageClient` pour debloquer le commit :)

```tsx
// components/dashboard/dashboard-page-client.tsx, dans le type des props :
export function DashboardPageClient({
  // ... existant
  periode: _periode, // prop nouvelle, sera utilisee Task 10
}: {
  // ... existant
  periode?: import('@/lib/utils/dashboard-periode').Periode;
}) {
```

---

### Task 6 : `AlertsStrip` (1 ligne compacte)

**Files:**

- Create: `components/dashboard/alerts-strip.tsx`
- Test: `__tests__/dashboard-alerts-strip.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/dashboard-alerts-strip.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertsStrip, type Alert } from '@/components/dashboard/alerts-strip';

describe('AlertsStrip', () => {
  it('rend chaque alerte avec son compteur et son label', () => {
    const alerts: Alert[] = [
      {
        count: 2,
        title: 'Factures en retard',
        href: '/facturation',
        color: 'red',
      },
      {
        count: 3,
        title: 'Echeances pretes',
        href: '/facturation',
        color: 'blue',
      },
    ];
    render(<AlertsStrip alerts={alerts} />);
    expect(screen.getByText('Factures en retard')).toBeDefined();
    expect(screen.getByText('Echeances pretes')).toBeDefined();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('affiche l etat "tout est sous controle" quand vide', () => {
    render(<AlertsStrip alerts={[]} />);
    expect(screen.getByText(/sous controle/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/dashboard-alerts-strip.test.tsx`
Expected: FAIL "Cannot find module ..."

- [ ] **Step 3: Implement component**

```tsx
// components/dashboard/alerts-strip.tsx
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Alert = {
  count: number;
  title: string;
  href: string;
  color: 'red' | 'orange' | 'blue';
};

const dotColor: Record<Alert['color'], string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  blue: 'bg-blue-500',
};

export function AlertsStrip({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="border-border/60 flex items-center gap-2 rounded-lg border bg-green-50 px-3 py-2 text-xs dark:bg-green-950/20">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
        <span className="font-medium text-green-700 dark:text-green-300">
          Tout est sous controle
        </span>
      </div>
    );
  }

  return (
    <div className="border-border/60 bg-card flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border px-3 py-2 text-xs">
      {alerts.map((a) => (
        <Link
          key={a.title}
          href={a.href}
          className="hover:text-foreground text-muted-foreground flex items-center gap-1.5 transition-colors"
        >
          <span
            className={cn(
              'inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white',
              dotColor[a.color],
            )}
          >
            {a.count}
          </span>
          <span className="font-medium">{a.title}</span>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/dashboard-alerts-strip.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/alerts-strip.tsx __tests__/dashboard-alerts-strip.test.tsx
git commit -m "feat(dashboard): AlertsStrip compact (1 ligne, vs ancienne pile)"
```

---

### Task 7 : `MiniKpiCard` (carte uniforme tier 2)

**Files:**

- Create: `components/dashboard/mini-kpi-card.tsx`
- Test: `__tests__/dashboard-mini-kpi-card.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/dashboard-mini-kpi-card.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MiniKpiCard } from '@/components/dashboard/mini-kpi-card';

describe('MiniKpiCard', () => {
  it('rend label, value, subtitle', () => {
    render(
      <MiniKpiCard label="Projets actifs" value="6" subtitle="en cours" />,
    );
    expect(screen.getByText('Projets actifs')).toBeDefined();
    expect(screen.getByText('6')).toBeDefined();
    expect(screen.getByText('en cours')).toBeDefined();
  });

  it('rend un Link quand href est fourni', () => {
    render(<MiniKpiCard label="X" value="1" href="/projets" />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/projets');
  });

  it('affiche le bouton de hide en editMode', () => {
    let hidden = false;
    render(
      <MiniKpiCard
        label="X"
        value="1"
        editMode
        onHide={() => {
          hidden = true;
        }}
      />,
    );
    screen.getByLabelText(/masquer/i).click();
    expect(hidden).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/dashboard-mini-kpi-card.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement component**

```tsx
// components/dashboard/mini-kpi-card.tsx
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface MiniKpiCardProps {
  label: string;
  value: string;
  subtitle?: string;
  href?: string;
  editMode?: boolean;
  onHide?: () => void;
}

export function MiniKpiCard({
  label,
  value,
  subtitle,
  href,
  editMode,
  onHide,
}: MiniKpiCardProps) {
  const inner = (
    <>
      <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </div>
      <div className="num mt-1 text-lg font-bold tracking-tight">{value}</div>
      {subtitle && (
        <div className="text-muted-foreground mt-0.5 text-[10px]">
          {subtitle}
        </div>
      )}
    </>
  );

  const isClickable = !!href && !editMode;

  return (
    <div
      className={cn(
        'border-border/60 bg-card relative rounded-lg border p-3 transition-colors',
        isClickable && 'hover:border-foreground/20 cursor-pointer',
      )}
    >
      {editMode && onHide && (
        <button
          type="button"
          onClick={onHide}
          aria-label={`Masquer ${label}`}
          className="bg-background border-border hover:bg-destructive hover:text-destructive-foreground absolute top-1 right-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px]"
        >
          ×
        </button>
      )}
      {isClickable ? (
        <Link href={href} aria-label={`Voir : ${label}`} className="block">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/dashboard-mini-kpi-card.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/mini-kpi-card.tsx __tests__/dashboard-mini-kpi-card.test.tsx
git commit -m "feat(dashboard): MiniKpiCard uniforme pour tier 2 (ops/qualite)"
```

---

### Task 8 : Utilitaire CSS `.num` (tabular + slashed-zero)

**Files:**

- Modify: `app/globals.css`

- [ ] **Step 1: Lire la fin du fichier**

Run: `tail -40 app/globals.css`

- [ ] **Step 2: Ajouter la classe utilitaire**

Append a `app/globals.css` :

```css
@layer utilities {
  .num {
    font-feature-settings: 'tnum', 'zero';
    font-variant-numeric: tabular-nums slashed-zero;
  }
}
```

- [ ] **Step 3: Build pour verifier**

Run: `npm run build`
Expected: build OK

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat(dashboard): utilitaire .num (tabular-nums + slashed-zero)"
```

---

### Task 9 : `TrinityFunnel` (3 cards conversion)

**Files:**

- Create: `components/dashboard/trinity-funnel.tsx`
- Test: `__tests__/dashboard-trinity-funnel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/dashboard-trinity-funnel.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrinityFunnel } from '@/components/dashboard/trinity-funnel';

describe('TrinityFunnel', () => {
  it('rend les 3 cards avec montants', () => {
    render(
      <TrinityFunnel
        production={42580}
        facture={38200}
        encaisse={31100}
        productionTrend={12}
      />,
    );
    expect(screen.getByText('Production')).toBeDefined();
    expect(screen.getByText(/42[\s ]580/)).toBeDefined();
    expect(screen.getByText('Facturé')).toBeDefined();
    expect(screen.getByText('Encaissé')).toBeDefined();
  });

  it('calcule les % de conversion', () => {
    render(
      <TrinityFunnel
        production={1000}
        facture={900}
        encaisse={500}
        productionTrend={0}
      />,
    );
    expect(screen.getByText('90%')).toBeDefined();
    expect(screen.getByText('50%')).toBeDefined();
  });

  it('gere production = 0 sans NaN', () => {
    render(
      <TrinityFunnel
        production={0}
        facture={0}
        encaisse={0}
        productionTrend={0}
      />,
    );
    expect(screen.getAllByText(/0[\s ]€/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/NaN/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/dashboard-trinity-funnel.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement component**

```tsx
// components/dashboard/trinity-funnel.tsx
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/formatters';

export interface TrinityFunnelProps {
  production: number;
  facture: number;
  encaisse: number;
  productionTrend: number;
  isNegativeProductionTrend?: boolean;
  editMode?: boolean;
  onHide?: () => void;
}

function pct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

export function TrinityFunnel({
  production,
  facture,
  encaisse,
  productionTrend,
  editMode,
  onHide,
}: TrinityFunnelProps) {
  const pctFacture = pct(facture, production);
  const pctEncaisse = pct(encaisse, production);
  const resteAFacturer = Math.max(0, production - facture);
  const enAttentePaiement = Math.max(0, facture - encaisse);
  const trendUp = productionTrend > 0;

  return (
    <div className="border-border/60 bg-border/60 relative grid grid-cols-1 gap-px overflow-hidden rounded-xl border md:grid-cols-3">
      {editMode && onHide && (
        <button
          type="button"
          onClick={onHide}
          aria-label="Masquer le funnel"
          className="bg-background border-border hover:bg-destructive hover:text-destructive-foreground absolute top-2 right-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs"
        >
          ×
        </button>
      )}

      {/* Card 1 - Production */}
      <div className="from-card to-muted/30 bg-gradient-to-b p-5">
        <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
          Production
        </div>
        <div className="num mt-2 text-3xl font-bold tracking-tight">
          {formatCurrency(production)}
        </div>
        {productionTrend !== 0 && (
          <div
            className={cn(
              'mt-1 flex items-center gap-1 text-xs font-semibold',
              trendUp
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400',
            )}
          >
            {trendUp ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            <span className="num">
              {trendUp ? '+' : ''}
              {productionTrend}% vs M-1
            </span>
          </div>
        )}
        <div className="bg-muted/40 mt-3 h-1 overflow-hidden rounded">
          <div className="bg-foreground h-full w-full rounded" />
        </div>
      </div>

      {/* Card 2 - Facture */}
      <div className="bg-card p-5">
        <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
          Facturé
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="num text-muted-foreground text-xl font-bold">
            {pctFacture}%
          </span>
          <span className="num text-2xl font-bold tracking-tight">
            {formatCurrency(facture)}
          </span>
        </div>
        <div className="text-muted-foreground mt-1 text-xs">
          {resteAFacturer > 0
            ? `${formatCurrency(resteAFacturer)} reste à facturer`
            : 'tout est facturé'}
        </div>
        <div className="bg-muted/40 mt-3 h-1 overflow-hidden rounded">
          <div
            className="h-full rounded bg-blue-500"
            style={{ width: `${Math.min(100, pctFacture)}%` }}
          />
        </div>
      </div>

      {/* Card 3 - Encaisse */}
      <div className="bg-card p-5">
        <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
          Encaissé
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="num text-muted-foreground text-xl font-bold">
            {pctEncaisse}%
          </span>
          <span className="num text-2xl font-bold tracking-tight">
            {formatCurrency(encaisse)}
          </span>
        </div>
        <div className="text-muted-foreground mt-1 text-xs">
          {enAttentePaiement > 0
            ? `${formatCurrency(enAttentePaiement)} en attente de paiement`
            : 'tout est encaissé'}
        </div>
        <div className="bg-muted/40 mt-3 h-1 overflow-hidden rounded">
          <div
            className="h-full rounded bg-green-500"
            style={{ width: `${Math.min(100, pctEncaisse)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/dashboard-trinity-funnel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/trinity-funnel.tsx __tests__/dashboard-trinity-funnel.test.tsx
git commit -m "feat(dashboard): TrinityFunnel (Production -> Facture -> Encaisse)"
```

---

### Task 10 : `ContextChips` (En retard / A facturer / Ta semaine)

**Files:**

- Create: `components/dashboard/context-chips.tsx`
- Test: `__tests__/dashboard-context-chips.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/dashboard-context-chips.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContextChips } from '@/components/dashboard/context-chips';

describe('ContextChips', () => {
  it('rend les 3 chips quand toutes valeurs sont > 0', () => {
    render(<ContextChips enRetard={4200} aFacturer={7800} weekHours={18} />);
    expect(screen.getByText(/En retard/)).toBeDefined();
    expect(screen.getByText(/À facturer/)).toBeDefined();
    expect(screen.getByText(/Ta semaine/)).toBeDefined();
  });

  it('omet "En retard" si 0', () => {
    render(<ContextChips enRetard={0} aFacturer={7800} weekHours={18} />);
    expect(screen.queryByText(/En retard/)).toBeNull();
  });

  it('omet "A facturer" si 0', () => {
    render(<ContextChips enRetard={4200} aFacturer={0} weekHours={18} />);
    expect(screen.queryByText(/À facturer/)).toBeNull();
  });

  it('rend toujours "Ta semaine" (info perso)', () => {
    render(<ContextChips enRetard={0} aFacturer={0} weekHours={0} />);
    expect(screen.getByText(/Ta semaine/)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/dashboard-context-chips.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement component**

```tsx
// components/dashboard/context-chips.tsx
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/formatters';

interface ChipDef {
  key: string;
  label: string;
  value: string;
  href: string;
  cta: string;
  tone: 'danger' | 'info' | 'warn' | 'ok';
}

const dotTone: Record<ChipDef['tone'], string> = {
  danger: 'bg-red-500',
  info: 'bg-blue-500',
  warn: 'bg-orange-500',
  ok: 'bg-green-500',
};

const valueTone: Record<ChipDef['tone'], string> = {
  danger: 'text-red-600 dark:text-red-400',
  info: 'text-foreground',
  warn: 'text-foreground',
  ok: 'text-foreground',
};

export function ContextChips({
  enRetard,
  aFacturer,
  weekHours,
}: {
  enRetard: number;
  aFacturer: number;
  weekHours: number;
}) {
  const chips: ChipDef[] = [];
  if (enRetard > 0) {
    chips.push({
      key: 'enRetard',
      label: 'En retard',
      value: formatCurrency(enRetard),
      href: '/facturation',
      cta: 'Relancer',
      tone: 'danger',
    });
  }
  if (aFacturer > 0) {
    chips.push({
      key: 'aFacturer',
      label: 'À facturer',
      value: formatCurrency(aFacturer),
      href: '/facturation',
      cta: 'Émettre',
      tone: 'info',
    });
  }
  chips.push({
    key: 'semaine',
    label: 'Ta semaine',
    value: `${weekHours}h / 35h`,
    href: '/temps',
    cta: 'Saisir',
    tone: weekHours >= 35 ? 'ok' : 'warn',
  });

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          className="border-border/60 bg-card hover:border-foreground/20 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors"
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', dotTone[c.tone])} />
          <span className="text-muted-foreground">{c.label}</span>
          <span className={cn('num font-bold', valueTone[c.tone])}>
            {c.value}
          </span>
          <span className="text-primary font-semibold">{c.cta} ›</span>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/dashboard-context-chips.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/context-chips.tsx __tests__/dashboard-context-chips.test.tsx
git commit -m "feat(dashboard): ContextChips (En retard / A facturer / Ta semaine)"
```

---

## Phase 3 - Integration page

### Task 11 : Refactor `DashboardPageClient` pour utiliser les nouveaux composants

**Files:**

- Modify: `components/dashboard/dashboard-page-client.tsx`

C'est la grosse modif. On remplace :

- Le bloc Alerts pile par `<AlertsStrip>`
- Le bloc Personal Time Widget par sa disparition (info migre dans chips)
- Le section Performance financiere (4 KpiCard) par `<TrinityFunnel>` + `<ContextChips>`
- Les sections Operationnelle (5 KpiCard) et Qualite (3 KpiCard) par des grids de `<MiniKpiCard>`
- Le bouton Personnaliser/Restaurer reste mais migre dans une ligne au-dessus du contenu

- [ ] **Step 1: Lire le fichier complet**

Run: `wc -l components/dashboard/dashboard-page-client.tsx`
Then read it fully via Read tool.

- [ ] **Step 2: Rewrite le fichier**

Le fichier final doit :

1. **Garder** la logique d'evolution M/M-1 (`evolutionData`, `handleExportExcel`)
2. **Garder** `useHiddenKpis` et le mode edit
3. **Garder** la section Charts (RevenueTrendChart + InvoiceStatusChart)
4. **Garder** la section Evolution table
5. **Remplacer** la structure Alerts / Personal / Financial / Operational / Quality

Voici la structure cible (squelette, garder les helpers existants pour evolution table) :

```tsx
'use client';

import { useState } from 'react';
import {
  TrendingUp,
  Download,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/formatters';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  DashboardFinancials,
  KpiSnapshotMap,
  MonthlyTrendRow,
  InvoiceStatusBreakdown,
} from '@/lib/queries/dashboard';
import type { Periode } from '@/lib/utils/dashboard-periode';
import { RevenueTrendChart } from '@/components/dashboard/revenue-trend-chart';
import { InvoiceStatusChart } from '@/components/dashboard/invoice-status-chart';
import { useHiddenKpis } from '@/components/dashboard/use-hidden-kpis';
import { TrinityFunnel } from '@/components/dashboard/trinity-funnel';
import { ContextChips } from '@/components/dashboard/context-chips';
import { AlertsStrip, type Alert } from '@/components/dashboard/alerts-strip';
import { MiniKpiCard } from '@/components/dashboard/mini-kpi-card';

export interface DashboardData {
  projetsActifs: number;
  facturesEnRetard: number;
  facturesEmises: number;
  echeancesAFacturer: number;
  contratsActifs: number;
  contratsSansProgression: number;
}

interface EvolutionRow {
  label: string;
  current: string;
  previous: string;
  change: number;
  unit: '%' | 'pt';
  positiveIsGood: boolean;
}

function handleExportExcel(evolutionData: EvolutionRow[]) {
  const headers = ['KPI', 'Actuel', 'Précédent', 'Évolution'];
  const rows = evolutionData.map((row) => [
    row.label,
    row.current,
    row.previous,
    row.change === 0
      ? '-'
      : `${row.change > 0 ? '+' : ''}${row.change}${row.unit}`,
  ]);
  const csvContent = [headers, ...rows]
    .map((r) => r.map((c) => `"${c}"`).join(';'))
    .join('\n');
  const blob = new Blob(['﻿' + csvContent], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `dashboard-evolution-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function DashboardPageClient({
  data,
  financials,
  previousKpis,
  monthlyTrend,
  invoiceBreakdown,
  weekHours,
  periode: _periode,
}: {
  data: DashboardData;
  financials: DashboardFinancials;
  previousKpis: KpiSnapshotMap;
  monthlyTrend: MonthlyTrendRow[];
  invoiceBreakdown: InvoiceStatusBreakdown;
  weekHours: number;
  periode?: Periode;
}) {
  const [editMode, setEditMode] = useState(false);
  const { isHidden, toggle, hiddenKeys, restoreAll } = useHiddenKpis();

  const {
    totalProduction,
    totalFacture,
    totalEncaisse,
    totalEnRetard,
    totalAFacturer,
    nbApprenantsActifs,
    nbFormationsEnCours,
    nbAbandons,
    pedagogieAvgPct,
    nbApprenantsRqth,
    rqthPct,
    tauxSaisieTemps,
    tempsNonSaisi,
  } = financials;

  // ----- Alerts -----
  const alerts: Alert[] = [
    data.facturesEnRetard > 0
      ? {
          count: data.facturesEnRetard,
          title: 'Factures en retard',
          href: '/facturation',
          color: 'red' as const,
        }
      : null,
    data.echeancesAFacturer > 0
      ? {
          count: data.echeancesAFacturer,
          title: 'Échéances prêtes',
          href: '/facturation',
          color: 'blue' as const,
        }
      : null,
    tempsNonSaisi > 0
      ? {
          count: tempsNonSaisi,
          title: 'Jours sans saisie',
          href: '/temps',
          color: 'orange' as const,
        }
      : null,
    data.contratsSansProgression > 0
      ? {
          count: data.contratsSansProgression,
          title: 'Contrats sans progression',
          href: '/projets',
          color: 'orange' as const,
        }
      : null,
  ].filter((a): a is Alert => a !== null);

  // ----- M-1 evolution -----
  const hasPrevious = Object.keys(previousKpis).length > 0;
  function computeEvolution(current: number, prev: number | undefined): number {
    if (!hasPrevious || prev === undefined || prev === 0) return 0;
    return Math.round(((current - prev) / prev) * 1000) / 10;
  }

  const prevTotalFacture = previousKpis['total_facture_ht'];
  const prevTotalEncaisse = previousKpis['total_encaisse'];
  const prevProjetsActifs = previousKpis['projets_actifs'];
  const prevContratsActifs = previousKpis['contrats_actifs'];
  const prevProduction = prevTotalFacture;
  const prevEnRetardAmount =
    prevTotalFacture !== undefined && prevTotalEncaisse !== undefined
      ? Math.max(0, prevTotalFacture - prevTotalEncaisse)
      : undefined;

  const evolutionData: EvolutionRow[] = [
    {
      label: 'Production',
      current: formatCurrency(totalProduction),
      previous:
        hasPrevious && prevProduction !== undefined
          ? formatCurrency(prevProduction)
          : '-',
      change: computeEvolution(totalProduction, prevProduction),
      unit: '%',
      positiveIsGood: true,
    },
    {
      label: 'Facturé',
      current: formatCurrency(totalFacture),
      previous:
        hasPrevious && prevTotalFacture !== undefined
          ? formatCurrency(prevTotalFacture)
          : '-',
      change: computeEvolution(totalFacture, prevTotalFacture),
      unit: '%',
      positiveIsGood: true,
    },
    {
      label: 'Encaissé',
      current: formatCurrency(totalEncaisse),
      previous:
        hasPrevious && prevTotalEncaisse !== undefined
          ? formatCurrency(prevTotalEncaisse)
          : '-',
      change: computeEvolution(totalEncaisse, prevTotalEncaisse),
      unit: '%',
      positiveIsGood: true,
    },
    {
      label: 'En retard',
      current: formatCurrency(totalEnRetard),
      previous:
        hasPrevious && prevEnRetardAmount !== undefined
          ? formatCurrency(prevEnRetardAmount)
          : '-',
      change: computeEvolution(totalEnRetard, prevEnRetardAmount),
      unit: '%',
      positiveIsGood: false,
    },
    {
      label: 'Projets actifs',
      current: String(data.projetsActifs),
      previous:
        hasPrevious && prevProjetsActifs !== undefined
          ? String(prevProjetsActifs)
          : '-',
      change: computeEvolution(data.projetsActifs, prevProjetsActifs),
      unit: '%',
      positiveIsGood: true,
    },
    {
      label: 'Contrats actifs',
      current: String(data.contratsActifs),
      previous:
        hasPrevious && prevContratsActifs !== undefined
          ? String(prevContratsActifs)
          : '-',
      change: computeEvolution(data.contratsActifs, prevContratsActifs),
      unit: '%',
      positiveIsGood: true,
    },
  ];

  const productionTrend = computeEvolution(totalProduction, prevProduction);

  // Mode edit helper
  const renderIfVisible = (key: string, node: React.ReactNode) =>
    isHidden(key) ? null : node;

  return (
    <div className="space-y-5">
      {/* Alerts compact */}
      {renderIfVisible('alerts', <AlertsStrip alerts={alerts} />)}

      {/* Trinity funnel */}
      {renderIfVisible(
        'trinity',
        <TrinityFunnel
          production={totalProduction}
          facture={totalFacture}
          encaisse={totalEncaisse}
          productionTrend={productionTrend}
          editMode={editMode}
          onHide={() => toggle('trinity')}
        />,
      )}

      {/* Chips */}
      {renderIfVisible(
        'chips',
        <ContextChips
          enRetard={totalEnRetard}
          aFacturer={totalAFacturer}
          weekHours={weekHours}
        />,
      )}

      {/* Personnalisation toolbar */}
      <div className="flex items-center justify-end gap-2 text-xs">
        {hiddenKeys.size > 0 && (
          <span className="text-muted-foreground">
            {hiddenKeys.size} bloc(s) masqué(s) ·{' '}
            <button
              type="button"
              onClick={restoreAll}
              className="text-primary hover:underline"
            >
              Restaurer
            </button>
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditMode((v) => !v)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 transition-colors',
            editMode
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border hover:bg-accent',
          )}
        >
          {editMode ? 'Terminer' : 'Personnaliser'}
        </button>
      </div>

      {/* Operationnel */}
      <section>
        <h2 className="text-muted-foreground mb-3 text-[10px] font-semibold tracking-wider uppercase">
          Activité opérationnelle
        </h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
          {renderIfVisible(
            'projetsActifs',
            <MiniKpiCard
              label="Projets actifs"
              value={String(data.projetsActifs)}
              subtitle="en cours de suivi"
              href="/projets"
              editMode={editMode}
              onHide={() => toggle('projetsActifs')}
            />,
          )}
          {renderIfVisible(
            'contratsActifs',
            <MiniKpiCard
              label="Contrats"
              value={String(data.contratsActifs)}
              subtitle="tous projets confondus"
              href="/projets"
              editMode={editMode}
              onHide={() => toggle('contratsActifs')}
            />,
          )}
          {renderIfVisible(
            'apprenantsActifs',
            <MiniKpiCard
              label="Apprenants"
              value={String(nbApprenantsActifs)}
              subtitle="contrats en cours"
              href="/projets"
              editMode={editMode}
              onHide={() => toggle('apprenantsActifs')}
            />,
          )}
          {renderIfVisible(
            'formationsEnCours',
            <MiniKpiCard
              label="Formations"
              value={String(nbFormationsEnCours)}
              subtitle="en cours (Eduvia)"
              href="/projets"
              editMode={editMode}
              onHide={() => toggle('formationsEnCours')}
            />,
          )}
          {renderIfVisible(
            'tauxSaisieTemps',
            <MiniKpiCard
              label="Saisie temps"
              value={`${tauxSaisieTemps}%`}
              subtitle="moyenne equipe"
              href="/temps"
              editMode={editMode}
              onHide={() => toggle('tauxSaisieTemps')}
            />,
          )}
        </div>
      </section>

      {/* Qualite */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
            Qualité & pédagogie
          </h2>
          <a
            href="/qualiopi"
            className="text-primary text-[10px] font-medium hover:underline"
          >
            Voir Qualiopi ›
          </a>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {renderIfVisible(
            'pedagogie',
            <MiniKpiCard
              label="Progression pédagogie"
              value={`${pedagogieAvgPct}%`}
              subtitle="moyenne contrats actifs"
              href="/qualiopi"
              editMode={editMode}
              onHide={() => toggle('pedagogie')}
            />,
          )}
          {renderIfVisible(
            'abandons',
            <MiniKpiCard
              label="Abandons"
              value={String(nbAbandons)}
              subtitle="resilies / annules"
              href="/projets"
              editMode={editMode}
              onHide={() => toggle('abandons')}
            />,
          )}
          {renderIfVisible(
            'rqth',
            <MiniKpiCard
              label="Apprenants RQTH"
              value={`${rqthPct}%`}
              subtitle={`${nbApprenantsRqth} apprenant(s) en situation de handicap`}
              href="/projets"
              editMode={editMode}
              onHide={() => toggle('rqth')}
            />,
          )}
        </div>
      </section>

      {/* Charts */}
      <section>
        <h2 className="text-muted-foreground mb-3 text-[10px] font-semibold tracking-wider uppercase">
          Visualisations
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RevenueTrendChart data={monthlyTrend} />
          <InvoiceStatusChart data={invoiceBreakdown} />
        </div>
      </section>

      {/* Evolution table */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
            Évolution M / M-1
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExportExcel(evolutionData)}
          >
            <Download className="h-3.5 w-3.5" data-icon="inline-start" />
            Exporter
          </Button>
        </div>
        <Card className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">KPI</TableHead>
                <TableHead className="text-right">Actuel</TableHead>
                <TableHead className="text-right">M-1</TableHead>
                <TableHead className="pr-4 text-right">Évol.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {evolutionData.map((row) => {
                const isPositive = row.change > 0;
                const isGood = row.positiveIsGood ? isPositive : !isPositive;
                const changeSign = isPositive ? '+' : '';
                const changeSuffix = row.unit === 'pt' ? 'pt' : '%';
                return (
                  <TableRow key={row.label}>
                    <TableCell className="pl-4 font-medium">
                      {row.label}
                    </TableCell>
                    <TableCell className="num text-right">
                      {row.current}
                    </TableCell>
                    <TableCell className="num text-muted-foreground text-right">
                      {row.previous}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      {row.change === 0 ? (
                        <span className="text-muted-foreground text-xs">-</span>
                      ) : (
                        <span
                          className={cn(
                            'num inline-flex items-center gap-0.5 text-xs font-semibold',
                            isGood
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400',
                          )}
                        >
                          {isPositive ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {changeSign}
                          {row.change}
                          {changeSuffix}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 erreur

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: 0 erreur

- [ ] **Step 5: Tests**

Run: `npx vitest run`
Expected: tous les tests passent (les anciens KpiCard tests si presents doivent etre nettoyes)

- [ ] **Step 6: Smoke test manuel**

Run: `npm run dev`
Ouvrir `http://localhost:3000/dashboard`
Verifier visuellement :

- Alerts strip 1 ligne (ou green check si pas d'alerte)
- Trinity funnel 3 cards avec %
- Chips en dessous
- Operationnel grid 5
- Qualite grid 3
- Charts inchanges
- Table M/M-1 inchangee

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/dashboard-page-client.tsx
git commit -m "feat(dashboard): refonte premium (trinity funnel + chips + mini-cards)"
```

---

### Task 12 : Cleanup - supprimer code mort

**Files:**

- Modify: `components/dashboard/dashboard-page-client.tsx` (suppressions imports)
- Verifier : autres usages de `KpiCard`, `Sparkline` interne, `alertColorMap`

- [ ] **Step 1: Verifier que les patterns ne sont plus utilises**

Run: `grep -rn "KpiCard\|alertColorMap\|kpiColorMap\|sparklineColorMap" components/ app/`
Expected: aucun match dans dashboard-page-client.tsx, eventuellement matches ailleurs (auquel cas garder le composant).

- [ ] **Step 2: Si `Sparkline` n'est plus utilise nulle part, le supprimer**

Run: `grep -rn "from '@/components/dashboard/sparkline'" .`
Si zero match : `rm components/dashboard/sparkline.tsx`
Sinon : garder.

- [ ] **Step 3: Type-check + lint + tests final**

Run en parallele :

```bash
npx tsc --noEmit && npm run lint && npx vitest run
```

Expected: 0 erreur, tous tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(dashboard): cleanup code mort post-refonte"
```

---

## Self-review checklist (a faire avant de declarer le plan fini)

- [ ] Spec coverage :
  - Toolbar / period selector -> Task 4 + 5
  - Alerts strip compact -> Task 6
  - Trinity funnel -> Task 9
  - Chips contextuels -> Task 10
  - Mini-cards ops / qualite -> Task 7 + Task 11
  - Calage temporel mois courant -> Task 1 + 2
  - totalAFacturer -> Task 3
  - Suppression Personal Time Widget + ancien Alerts -> Task 11 (rewrite)
  - Utilitaire CSS .num -> Task 8
  - Charts + evolution table inchanges -> Task 11
- [ ] Placeholder scan : aucun TBD, chaque step a son code complet.
- [ ] Type consistency : `Periode` defini Task 1, utilise Tasks 2/4/11. `Alert` defini Task 6, utilise Task 11. `MiniKpiCardProps` defini Task 7, utilise Task 11.
