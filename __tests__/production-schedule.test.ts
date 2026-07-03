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
 * computeContractSchedule est la logique porteuse de la "Production" partout :
 * dashboard (funnel + tendance), page /production et rapport mensuel.
 * Production = commission SOLUVIA (schedule.soluvia) prorata sur la durée.
 * Le schedule.opco (40/30/20/10) ne sert plus qu'à la vue OPCO de /production.
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

  it('PRODUCTION SOLUVIA : commission HT répartie sur la durée (M+0..M+duree-1)', () => {
    expect(s.soluvia).toHaveLength(12); // duree = 12
    expect(s.soluvia[0]!.month).toBe('2026-01'); // M+0 = date_debut
    expect(s.soluvia[11]!.month).toBe('2026-12'); // M+11 = terme
    // TTC = 10000*40/100 = 4000 ; HT = 3333.33 ; mensualité = 3333.33/12 = 277.78
    expect(s.soluvia[0]!.amount).toBeCloseTo(277.78, 2);
    const totalHt = s.soluvia.reduce((acc, e) => acc + e.amount, 0);
    expect(totalHt).toBeCloseTo(3333.36, 1); // 277.78 * 12, arrondi mensualité
  });

  it('PRODUCTION prorata : durée 24 mois -> 24 mensualités = commissionHt / 24', () => {
    const s24 = computeContractSchedule('2026-01-15', 24, 12000, 50);
    expect(s24.soluvia).toHaveLength(24);
    // TTC = 12000*50/100 = 6000 ; HT = 5000 ; /24 = 208.33
    expect(s24.soluvia[0]!.amount).toBeCloseTo(208.33, 2);
    expect(s24.soluvia[0]!.month).toBe('2026-01');
    expect(s24.soluvia[23]!.month).toBe('2027-12');
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

  it('fin de mois : demarrage un 31 ne deborde pas sur le mois suivant (pas de rollover setMonth)', () => {
    // 31 janvier + 1 mois via setMonth donnerait "31 fevrier" = 3 mars :
    // versement OPCO 40% en mars au lieu de fevrier, et des mois SOLUVIA
    // a 0 EUR suivis de mois a double mensualite.
    const s31 = computeContractSchedule('2026-01-31', 12, 10000, 40);
    expect(s31.opco.map((e) => e.month)).toEqual([
      '2026-02',
      '2026-08',
      '2026-11',
      '2027-02',
    ]);
    // Mensualites SOLUVIA : 12 mois consecutifs sans trou ni doublon
    expect(s31.soluvia.map((e) => e.month)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
  });

  it('fin de mois : demarrage un 30 avec traversee de fevrier', () => {
    const s30 = computeContractSchedule('2025-12-30', 6, 6000, 40);
    expect(s30.soluvia.map((e) => e.month)).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
    ]);
    expect(s30.opco[0]!.month).toBe('2026-01'); // M+1
  });

  it('duree 1 mois : une seule mensualite SOLUVIA, solde OPCO a M+2', () => {
    const s1 = computeContractSchedule('2026-03-15', 1, 1200, 40);
    expect(s1.soluvia).toHaveLength(1);
    expect(s1.soluvia[0]!.month).toBe('2026-03');
    // TTC = 480 ; HT = 400
    expect(s1.soluvia[0]!.amount).toBeCloseTo(400, 2);
    // Solde 10% a M+duree+1 = M+2
    expect(s1.opco[3]).toEqual({ month: '2026-05', amount: 120 });
  });

  it('chevauchement d annee : les cles passent correctement d annee en annee', () => {
    const sNov = computeContractSchedule('2026-11-15', 4, 4000, 40);
    expect(sNov.soluvia.map((e) => e.month)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
    expect(sNov.opco.map((e) => e.month)).toEqual([
      '2026-12', // M+1
      '2027-06', // M+7
      '2027-09', // M+10
      '2027-04', // M+duree+1 = M+5
    ]);
  });

  it('taux commission 0 : production SOLUVIA nulle mais OPCO intact', () => {
    const s0 = computeContractSchedule('2026-01-15', 12, 10000, 0);
    expect(s0.opco.reduce((acc, e) => acc + e.amount, 0)).toBe(10000);
    expect(s0.soluvia.reduce((acc, e) => acc + e.amount, 0)).toBe(0);
  });
});
