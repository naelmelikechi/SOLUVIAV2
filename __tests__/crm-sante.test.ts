import { describe, it, expect } from 'vitest';
import {
  alertesSanteDues,
  derniereActivite,
  ALERTE_SANTE_COLONNE,
  SANTE_14_MS,
  SANTE_30_MS,
  type SanteOpp,
} from '@/lib/crm/domain/sante';

const T0 = new Date('2026-06-01T08:00:00Z');
const JOUR_MS = 86_400_000;

function opp(overrides: Partial<SanteOpp> = {}): SanteOpp {
  return {
    statut: 'ouverte',
    updated_at: T0.toISOString(),
    alerte_sante_14_at: null,
    alerte_sante_30_at: null,
    ...overrides,
  };
}

function at(offsetMs: number): Date {
  return new Date(T0.getTime() + offsetMs);
}

function iso(offsetMs: number): string {
  return at(offsetMs).toISOString();
}

describe('derniereActivite', () => {
  it('retombe sur updated_at sans activites', () => {
    expect(derniereActivite(opp(), [])).toBe(T0.getTime());
  });

  it('prend le max entre updated_at et les activites', () => {
    const plusRecent = iso(5 * JOUR_MS);
    expect(derniereActivite(opp(), [iso(2 * JOUR_MS), plusRecent])).toBe(
      new Date(plusRecent).getTime(),
    );
  });

  it('ignore les timestamps null/invalides', () => {
    expect(derniereActivite(opp(), [null, undefined, 'pas-une-date'])).toBe(
      T0.getTime(),
    );
  });
});

describe('alertesSanteDues', () => {
  it('rien avant 14 jours', () => {
    expect(alertesSanteDues(opp(), [], at(SANTE_14_MS - 1))).toEqual([]);
  });

  it('sante_14 a 14 jours pile', () => {
    expect(alertesSanteDues(opp(), [], at(SANTE_14_MS))).toEqual(['sante_14']);
  });

  it('a 30 jours : les deux alertes si aucune posee', () => {
    expect(alertesSanteDues(opp(), [], at(SANTE_30_MS))).toEqual([
      'sante_14',
      'sante_30',
    ]);
  });

  it('a 30 jours : seulement sante_30 si la 14 est deja posee', () => {
    const o = opp({ alerte_sante_14_at: iso(SANTE_14_MS) });
    expect(alertesSanteDues(o, [], at(SANTE_30_MS))).toEqual(['sante_30']);
  });

  it('idempotence : pas de re-notification tant que rien ne bouge', () => {
    const o = opp({
      alerte_sante_14_at: iso(SANTE_14_MS),
      alerte_sante_30_at: iso(SANTE_30_MS),
    });
    expect(alertesSanteDues(o, [], at(SANTE_30_MS + 10 * JOUR_MS))).toEqual([]);
  });

  it("re-armement : une activite posterieure a l'alerte relance le cycle", () => {
    // Alerte 14 posee a J14, nouvelle note a J20 -> re-alerte a J34.
    const o = opp({ alerte_sante_14_at: iso(SANTE_14_MS) });
    const note = iso(20 * JOUR_MS);
    expect(alertesSanteDues(o, [note], at(33 * JOUR_MS))).toEqual([]);
    expect(alertesSanteDues(o, [note], at(34 * JOUR_MS))).toEqual(['sante_14']);
  });

  it("la derniere activite (activite/rdv) repousse l'alerte", () => {
    expect(
      alertesSanteDues(opp(), [iso(10 * JOUR_MS)], at(SANTE_14_MS)),
    ).toEqual([]);
  });

  it('un RDV planifie dans le futur rend l opportunite saine', () => {
    const rdvFutur = iso(SANTE_30_MS + 30 * JOUR_MS);
    expect(alertesSanteDues(opp(), [rdvFutur], at(SANTE_30_MS))).toEqual([]);
  });

  it('ne concerne que les opportunites ouvertes', () => {
    expect(
      alertesSanteDues(opp({ statut: 'gagnee' }), [], at(SANTE_30_MS)),
    ).toEqual([]);
    expect(
      alertesSanteDues(opp({ statut: 'perdue' }), [], at(SANTE_30_MS)),
    ).toEqual([]);
  });

  it('mappe chaque alerte vers sa colonne d idempotence', () => {
    expect(ALERTE_SANTE_COLONNE.sante_14).toBe('alerte_sante_14_at');
    expect(ALERTE_SANTE_COLONNE.sante_30).toBe('alerte_sante_30_at');
  });
});
