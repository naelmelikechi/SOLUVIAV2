import { describe, it, expect } from 'vitest';
import { bucketRelances } from './relances';
import { parseDateOnly } from './dates';

const today = new Date('2026-06-24T10:00:00');
const r = (id: string, date_echeance: string, fait = false) => ({
  id,
  date_echeance,
  fait,
});

describe('bucketRelances', () => {
  it('classe par échéance et exclut les relances faites', () => {
    const res = bucketRelances(
      [
        r('1', '2026-06-20'), // en retard
        r('2', '2026-06-24'), // aujourd'hui
        r('3', '2026-06-27'), // à venir (<= 7j)
        r('4', '2026-07-10'), // plus tard
        r('5', '2026-06-19', true), // fait -> exclu
      ],
      today,
    );
    expect(res.enRetard.map((x) => x.id)).toEqual(['1']);
    expect(res.aujourdhui.map((x) => x.id)).toEqual(['2']);
    expect(res.aVenir.map((x) => x.id)).toEqual(['3']);
    expect(res.plusTard.map((x) => x.id)).toEqual(['4']);
  });

  it("ancre correctement sur une date 'aujourd'hui' (chaîne) - contrat de RelanceList (B-M1)", () => {
    // RelanceList appelle bucketRelances(relances, parseDateOnly(today)) où today vient de
    // todayInParis() côté serveur. On vérifie que ce câblage classe bien la frontière du jour.
    const res = bucketRelances(
      [r('a', '2026-06-23'), r('b', '2026-06-24'), r('c', '2026-06-25')],
      parseDateOnly('2026-06-24'),
    );
    expect(res.enRetard.map((x) => x.id)).toEqual(['a']);
    expect(res.aujourdhui.map((x) => x.id)).toEqual(['b']);
    expect(res.aVenir.map((x) => x.id)).toEqual(['c']);
  });

  it('frontière 7 jours : J+7 = à venir, J+8 = plus tard', () => {
    const res = bucketRelances(
      [r('j7', '2026-07-01'), r('j8', '2026-07-02')], // base 2026-06-24
      parseDateOnly('2026-06-24'),
    );
    expect(res.aVenir.map((x) => x.id)).toEqual(['j7']);
    expect(res.plusTard.map((x) => x.id)).toEqual(['j8']);
  });
});
