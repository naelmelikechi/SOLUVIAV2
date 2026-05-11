import { describe, it, expect } from 'vitest';
import {
  computeAbsenceHoursPerDay,
  computeAbsenceTotalHours,
  type AbsencePeriod,
} from '@/lib/utils/absences';

describe('computeAbsenceHoursPerDay', () => {
  const baseAbsence = (over: Partial<AbsencePeriod>): AbsencePeriod => ({
    id: 'abs-1',
    type: 'conges',
    date_debut: '2026-05-04',
    date_fin: '2026-05-06',
    demi_jour_debut: false,
    demi_jour_fin: false,
    ...over,
  });

  it('jours full -> 7h chacun', () => {
    const result = computeAbsenceHoursPerDay(
      [baseAbsence({})],
      ['2026-05-04', '2026-05-05', '2026-05-06'],
    );
    expect(result['2026-05-04']).toEqual({
      type: 'conges',
      hours: 7,
      absence_id: 'abs-1',
    });
    expect(result['2026-05-05']!.hours).toBe(7);
    expect(result['2026-05-06']!.hours).toBe(7);
  });

  it('demi_jour_debut -> 3.5h sur date_debut uniquement', () => {
    const result = computeAbsenceHoursPerDay(
      [baseAbsence({ demi_jour_debut: true })],
      ['2026-05-04', '2026-05-05', '2026-05-06'],
    );
    expect(result['2026-05-04']!.hours).toBe(3.5);
    expect(result['2026-05-05']!.hours).toBe(7);
    expect(result['2026-05-06']!.hours).toBe(7);
  });

  it('demi_jour_fin -> 3.5h sur date_fin uniquement', () => {
    const result = computeAbsenceHoursPerDay(
      [baseAbsence({ demi_jour_fin: true })],
      ['2026-05-04', '2026-05-05', '2026-05-06'],
    );
    expect(result['2026-05-04']!.hours).toBe(7);
    expect(result['2026-05-06']!.hours).toBe(3.5);
  });

  it('hors range -> pas d entree', () => {
    const result = computeAbsenceHoursPerDay(
      [baseAbsence({})],
      ['2026-05-01', '2026-05-10'],
    );
    expect(result['2026-05-01']).toBeUndefined();
    expect(result['2026-05-10']).toBeUndefined();
  });

  it('absence d 1 jour avec demi_jour_debut ET demi_jour_fin -> 3.5h (start prend, end ecrase si aussi half)', () => {
    const result = computeAbsenceHoursPerDay(
      [
        baseAbsence({
          date_debut: '2026-05-04',
          date_fin: '2026-05-04',
          demi_jour_debut: true,
          demi_jour_fin: true,
        }),
      ],
      ['2026-05-04'],
    );
    expect(result['2026-05-04']!.hours).toBe(3.5);
  });
});

describe('computeAbsenceTotalHours', () => {
  it('lundi a vendredi full -> 5j x 7h = 35h', () => {
    // 2026-05-04 lundi, 2026-05-08 vendredi
    const result = computeAbsenceTotalHours(
      '2026-05-04',
      '2026-05-08',
      false,
      false,
    );
    expect(result).toEqual({ jours: 5, heures: 35 });
  });

  it('exclut samedi/dimanche', () => {
    // 2026-05-02 samedi, 2026-05-08 vendredi
    const result = computeAbsenceTotalHours(
      '2026-05-02',
      '2026-05-08',
      false,
      false,
    );
    // Sam-dim exclus, Lun-Mar-Mer-Jeu-Ven = 5j
    expect(result.jours).toBe(5);
  });

  it('1 jour ouvre avec demi_jour_debut -> 3.5h', () => {
    // 2026-05-04 lundi
    const result = computeAbsenceTotalHours(
      '2026-05-04',
      '2026-05-04',
      true,
      false,
    );
    expect(result).toEqual({ jours: 1, heures: 3.5 });
  });

  it('2 jours avec demi debut + demi fin -> 7h (3.5 + 3.5)', () => {
    const result = computeAbsenceTotalHours(
      '2026-05-04',
      '2026-05-05',
      true,
      true,
    );
    expect(result).toEqual({ jours: 2, heures: 7 });
  });
});
