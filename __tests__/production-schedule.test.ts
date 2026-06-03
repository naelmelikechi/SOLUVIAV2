// Set required env BEFORE any import that loads @/lib/env (zod-validated).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { computeContractSchedule } from '@/lib/queries/production';

/**
 * computeContractSchedule est la logique porteuse de la "Production" du
 * dashboard ET du rapport mensuel (qui calcule la prod OPCO live depuis les
 * contrats, plus depuis la table morte production_mensuelle).
 */
describe('computeContractSchedule', () => {
  // Contrat 2026-01-15, 12 mois, NPEC 10000, commission 40%
  const s = computeContractSchedule('2026-01-15', 12, 10000, 40);

  it('OPCO : split 40/30/20/10 aux bons mois (M+1, M+7, M+10, M+duree+1)', () => {
    expect(s.opco).toEqual([
      { month: '2026-02', amount: 4000 },
      { month: '2026-08', amount: 3000 },
      { month: '2026-11', amount: 2000 },
      { month: '2027-02', amount: 1000 },
    ]);
  });

  it('OPCO : somme = 100% du NPEC (HT=TTC, non assujetti TVA)', () => {
    const total = s.opco.reduce((acc, e) => acc + e.amount, 0);
    expect(total).toBe(10000);
  });

  it('SOLUVIA : commission affichée en HT (TTC 4000 -> HT /1.2, étalée 12 mois)', () => {
    expect(s.soluvia).toHaveLength(12);
    // TTC = 10000*40/100 = 4000 ; HT = 3333.33 ; mensualité = 277.78
    expect(s.soluvia[0]!.amount).toBeCloseTo(277.78, 2);
    expect(s.soluvia[0]!.month).toBe('2026-04'); // M+3
    const totalHt = s.soluvia.reduce((acc, e) => acc + e.amount, 0);
    expect(totalHt).toBeCloseTo(3333.36, 1); // 277.78 * 12, arrondi mensualité
  });

  it('contrat invalide (npec<=0 ou duree<=0) -> schedules vides', () => {
    expect(computeContractSchedule('2026-01-15', 0, 10000, 40)).toEqual({
      opco: [],
      soluvia: [],
    });
    expect(computeContractSchedule('2026-01-15', 12, 0, 40)).toEqual({
      opco: [],
      soluvia: [],
    });
  });
});
