import { describe, it, expect } from 'vitest';
import {
  resolveEmployeeCost,
  computeHourlyCost,
  EMPLOYEE_COST_DEFAULTS_FALLBACK,
  type EmployeeCostInputs,
} from '@/lib/utils/employee-cost';

const ALL_NULL: EmployeeCostInputs = {
  salaire_brut_annuel: null,
  primes_annuelles: null,
  avantages_annuels: null,
  taux_charges_patronales: null,
  heures_hebdo: null,
  jours_conges_payes: null,
  jours_rtt: null,
};

describe('resolveEmployeeCost', () => {
  it('falls back to SOLUVIA defaults when every field is null', () => {
    expect(resolveEmployeeCost(ALL_NULL)).toEqual(
      EMPLOYEE_COST_DEFAULTS_FALLBACK,
    );
  });

  it('keeps employee values when provided, falling back per-field', () => {
    const r = resolveEmployeeCost({
      ...ALL_NULL,
      salaire_brut_annuel: 60_000,
      heures_hebdo: 39,
    });
    expect(r.salaire_brut_annuel).toBe(60_000);
    expect(r.heures_hebdo).toBe(39);
    expect(r.taux_charges_patronales).toBe(
      EMPLOYEE_COST_DEFAULTS_FALLBACK.taux_charges_patronales,
    );
  });

  it('honors caller-provided defaults override (parametres SOLUVIA-wide)', () => {
    const r = resolveEmployeeCost(ALL_NULL, { taux_charges_patronales: 50 });
    expect(r.taux_charges_patronales).toBe(50);
    // Other fields still hit the hard fallback.
    expect(r.salaire_brut_annuel).toBe(40_000);
  });

  it('zero is a valid value, not "missing"', () => {
    const r = resolveEmployeeCost({ ...ALL_NULL, primes_annuelles: 0 });
    expect(r.primes_annuelles).toBe(0);
  });
});

describe('computeHourlyCost', () => {
  it('computes a sane hourly cost for a 40k brut, 35h/week, 25 CP profile', () => {
    const b = computeHourlyCost(EMPLOYEE_COST_DEFAULTS_FALLBACK);
    // brut*1.42 + 0 primes + 1800 = 56800 + 1800 = 58600
    expect(b.coutTotalAnnuel).toBeCloseTo(58_600, 0);
    // heures théoriques: 35 × 52 = 1820
    expect(b.heuresTheoriques).toBe(1820);
    // CP 25 + RTT 0 + 9 fériés = 34 jours × 7h/jour = 238h
    expect(b.heuresNonTravaillees).toBeCloseTo(238, 0);
    // effectives: 1820 - 238 = 1582
    expect(b.heuresEffectives).toBeCloseTo(1582, 0);
    // ~37,04€/h
    expect(b.coutHoraire).toBeGreaterThan(35);
    expect(b.coutHoraire).toBeLessThan(40);
  });

  it('hourly cost monotonically rises with brut salary', () => {
    const cheap = computeHourlyCost({
      ...EMPLOYEE_COST_DEFAULTS_FALLBACK,
      salaire_brut_annuel: 30_000,
    });
    const dear = computeHourlyCost({
      ...EMPLOYEE_COST_DEFAULTS_FALLBACK,
      salaire_brut_annuel: 80_000,
    });
    expect(dear.coutHoraire).toBeGreaterThan(cheap.coutHoraire);
  });

  it('clamps heures_effectives to a minimum of 1 to avoid divide-by-zero', () => {
    // Pathological input: more CP+RTT than working days in a year
    const b = computeHourlyCost({
      ...EMPLOYEE_COST_DEFAULTS_FALLBACK,
      heures_hebdo: 35,
      jours_conges_payes: 365,
      jours_rtt: 365,
    });
    expect(b.heuresEffectives).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(b.coutHoraire)).toBe(true);
  });

  it('higher charges patronales lifts coutTotalAnnuel proportionally', () => {
    const a = computeHourlyCost({
      ...EMPLOYEE_COST_DEFAULTS_FALLBACK,
      taux_charges_patronales: 30,
    });
    const b = computeHourlyCost({
      ...EMPLOYEE_COST_DEFAULTS_FALLBACK,
      taux_charges_patronales: 50,
    });
    expect(b.coutTotalAnnuel).toBeGreaterThan(a.coutTotalAnnuel);
  });
});
