import { describe, it, expect } from 'vitest';
import {
  computeDailyProjectTotal,
  computeRowTotal,
  computeWeekTotal,
  computeWeeklyMax,
  isFullyBlocked,
} from '@/lib/utils/temps-totals';

// Semaine Lundi 2026-05-04 -> Dimanche 2026-05-10
const WEEK = [
  '2026-05-04',
  '2026-05-05',
  '2026-05-06',
  '2026-05-07',
  '2026-05-08',
  '2026-05-09',
  '2026-05-10',
];

describe('isFullyBlocked', () => {
  it('jour ferie -> bloque', () => {
    expect(isFullyBlocked('2026-05-04', {}, { '2026-05-04': '1er mai' })).toBe(
      true,
    );
  });

  it('absence pleine (>=7h) -> bloque', () => {
    expect(isFullyBlocked('2026-05-04', { '2026-05-04': 7 }, {})).toBe(true);
  });

  it('demi-journee (3.5h) -> non bloque', () => {
    expect(isFullyBlocked('2026-05-04', { '2026-05-04': 3.5 }, {})).toBe(false);
  });

  it('rien -> non bloque', () => {
    expect(isFullyBlocked('2026-05-04', {}, {})).toBe(false);
  });
});

describe('computeDailyProjectTotal', () => {
  const saisies = [
    { projet_id: 'p1', heures: { '2026-05-04': 4, '2026-05-05': 3 } },
    { projet_id: 'p2', heures: { '2026-05-04': 2, '2026-05-05': 4 } },
  ];

  it('somme des saisies projets sur le jour', () => {
    expect(computeDailyProjectTotal('2026-05-04', saisies, {}, {})).toBe(6);
  });

  it('zombie saisies sur jour avec absence pleine -> 0', () => {
    // Ce cas est exactement le bug remonte: une absence pleine est posee
    // alors qu il restait d anciennes saisies, le total ne doit PAS les
    // additionner.
    expect(
      computeDailyProjectTotal('2026-05-04', saisies, { '2026-05-04': 7 }, {}),
    ).toBe(0);
  });

  it('jour ferie -> 0', () => {
    expect(
      computeDailyProjectTotal(
        '2026-05-04',
        saisies,
        {},
        {
          '2026-05-04': '1er mai',
        },
      ),
    ).toBe(0);
  });

  it('demi-journee absence -> saisies projet comptees (cellule editable)', () => {
    // Sur une demi-journee, l utilisateur peut encore saisir du projet
    // jusqu a 3.5h, donc le total projet doit etre compte tel quel.
    expect(
      computeDailyProjectTotal(
        '2026-05-04',
        saisies,
        { '2026-05-04': 3.5 },
        {},
      ),
    ).toBe(6);
  });
});

describe('computeRowTotal', () => {
  it('ignore les heures sur jours bloques', () => {
    const saisie = {
      projet_id: 'p1',
      heures: {
        '2026-05-04': 7, // zombie sous une absence pleine
        '2026-05-05': 3,
        '2026-05-06': 2,
      },
    };
    expect(computeRowTotal(saisie, WEEK, { '2026-05-04': 7 }, {})).toBe(5);
  });

  it('ne compte que les jours ouvres (Lun-Ven)', () => {
    const saisie = {
      projet_id: 'p1',
      heures: { '2026-05-09': 4, '2026-05-10': 4 }, // sam, dim
    };
    expect(computeRowTotal(saisie, WEEK, {}, {})).toBe(0);
  });
});

describe('computeWeekTotal', () => {
  const saisies = [
    {
      projet_id: 'p1',
      heures: {
        '2026-05-04': 7,
        '2026-05-05': 7,
        '2026-05-06': 7,
        '2026-05-07': 7,
        '2026-05-08': 7,
      },
    },
  ];

  it('semaine pleine sans absence -> 35h', () => {
    expect(
      computeWeekTotal({
        weekDates: WEEK,
        saisies,
        absences: {},
        joursFeries: {},
      }),
    ).toBe(35);
  });

  it('jour ferie -> jour exclu et pas d absence ajoutee', () => {
    expect(
      computeWeekTotal({
        weekDates: WEEK,
        saisies,
        absences: {},
        joursFeries: { '2026-05-04': '1er mai' },
      }),
    ).toBe(28); // 5 jours -> 4 jours productifs
  });

  it('absence pleine + zombie saisie -> compte absence, pas la saisie', () => {
    expect(
      computeWeekTotal({
        weekDates: WEEK,
        saisies,
        absences: { '2026-05-04': 7 },
        joursFeries: {},
      }),
    ).toBe(35); // 4 jours x 7h projet + 7h absence
  });

  it('demi-journee absence -> additionne demi + projet du jour', () => {
    const halfDaySaisies = [
      {
        projet_id: 'p1',
        heures: { '2026-05-04': 3.5, '2026-05-05': 7 },
      },
    ];
    expect(
      computeWeekTotal({
        weekDates: WEEK,
        saisies: halfDaySaisies,
        absences: { '2026-05-04': 3.5 },
        joursFeries: {},
      }),
    ).toBe(3.5 + 3.5 + 7);
  });
});

describe('computeWeeklyMax', () => {
  it('5 jours ouvres -> 35h', () => {
    expect(computeWeeklyMax(WEEK, {})).toBe(35);
  });

  it('un ferie -> 28h', () => {
    expect(computeWeeklyMax(WEEK, { '2026-05-04': '1er mai' })).toBe(28);
  });
});
