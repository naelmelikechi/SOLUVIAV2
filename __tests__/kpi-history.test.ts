import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSparklineData,
  type SparklineParams,
} from '@/lib/queries/kpi-history';

const mockData = [
  { mois: '2026-05-01', valeur: 10 },
  { mois: '2026-04-01', valeur: 8 },
  { mois: '2026-03-01', valeur: 12 },
];

type ChainableBuilder = {
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
};

const mockBuilder = (data: typeof mockData) => {
  const chain: ChainableBuilder = {
    eq: vi.fn(function () {
      return chain;
    }),
    is: vi.fn(function () {
      return chain;
    }),
    order: vi.fn(() => ({
      limit: vi.fn(async () => ({ data, error: null })),
    })),
  };
  return {
    select: vi.fn(() => chain),
  };
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => mockBuilder(mockData)),
  })),
}));

describe('getSparklineData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retourne les points en ordre chronologique (vieux -> recent)', async () => {
    const params: SparklineParams = {
      kpiType: 'projets_actifs',
      scope: 'global',
    };
    const result = await getSparklineData(params);
    expect(result.map((p) => p.mois)).toEqual([
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
    ]);
  });

  it('renvoie tableau vide si pas de donnees', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValueOnce({
      from: () => mockBuilder([]),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    const result = await getSparklineData({
      kpiType: 'projets_actifs',
      scope: 'global',
    });
    expect(result).toEqual([]);
  });
});
