import { describe, it, expect } from 'vitest';
import {
  computeRecapPeriod,
  computeDormantes,
  statsParCommercial,
} from './recap';

const at = (iso: string) => new Date(iso);

describe('computeRecapPeriod', () => {
  it('lundi remonte à vendredi (week-end inclus) et vise mercredi', () => {
    // 2026-06-29 = lundi
    const p = computeRecapPeriod(at('2026-06-29T16:00:00Z'));
    expect(p.startDateOnly).toBe('2026-06-26');
    expect(p.nextRecapDateOnly).toBe('2026-07-01');
  });
  it('mercredi remonte à lundi et vise vendredi', () => {
    const p = computeRecapPeriod(at('2026-07-01T16:00:00Z')); // mercredi
    expect(p.startDateOnly).toBe('2026-06-29');
    expect(p.nextRecapDateOnly).toBe('2026-07-03');
  });
  it('vendredi remonte à mercredi et vise lundi', () => {
    const p = computeRecapPeriod(at('2026-07-03T16:00:00Z')); // vendredi
    expect(p.startDateOnly).toBe('2026-07-01');
    expect(p.nextRecapDateOnly).toBe('2026-07-06');
  });
  it('déclenchement manuel un mardi remonte au lundi', () => {
    const p = computeRecapPeriod(at('2026-06-30T10:00:00Z')); // mardi
    expect(p.startDateOnly).toBe('2026-06-29');
  });
});

describe('computeRecapPeriod — bascules DST', () => {
  it("lundi après passage à l'heure d'été : start = vendredi (pas jeudi)", () => {
    const p = computeRecapPeriod(at('2026-03-30T16:00:00Z')); // transition dim. 2026-03-29
    expect(p.startDateOnly).toBe('2026-03-27');
    expect(p.nextRecapDateOnly).toBe('2026-04-01');
  });
  it("vendredi avant passage à l'heure d'hiver : nextRecap = lundi (pas dimanche)", () => {
    const p = computeRecapPeriod(at('2026-10-23T16:00:00Z')); // transition dim. 2026-10-25
    expect(p.startDateOnly).toBe('2026-10-21');
    expect(p.nextRecapDateOnly).toBe('2026-10-26');
  });
});

describe('computeDormantes', () => {
  const base = {
    id: 'o1',
    intitule: 'Acme',
    statut: 'ouverte',
    owner: { nom_complet: 'Ilias' },
    compte: { nom: 'Acme' },
    activites: [] as { created_at: string }[],
    relances: [] as {
      date_echeance: string;
      fait: boolean;
      archived_at: string | null;
    }[],
    rdv: [] as { debut: string }[],
  };
  const now = at('2026-07-01T12:00:00Z');

  it('exclut une opp avec activité récente (< 14 j)', () => {
    const r = computeDormantes(
      [{ ...base, activites: [{ created_at: '2026-06-28T09:00:00Z' }] }],
      now,
    );
    expect(r).toHaveLength(0);
  });
  it('exclut une opp avec une relance future non faite', () => {
    const r = computeDormantes(
      [
        {
          ...base,
          relances: [
            { date_echeance: '2026-07-10', fait: false, archived_at: null },
          ],
        },
      ],
      now,
    );
    expect(r).toHaveLength(0);
  });
  it('exclut une opp avec un RDV futur', () => {
    const r = computeDormantes(
      [{ ...base, rdv: [{ debut: '2026-07-05T09:00:00Z' }] }],
      now,
    );
    expect(r).toHaveLength(0);
  });
  it('inclut une opp sans activité récente ni action future, avec le nb de jours', () => {
    const r = computeDormantes(
      [{ ...base, activites: [{ created_at: '2026-06-01T09:00:00Z' }] }],
      now,
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.intitule).toBe('Acme');
    expect(r[0]!.joursInactif).toBeGreaterThanOrEqual(14);
  });
  it('trie du plus dormant au moins dormant', () => {
    const r = computeDormantes(
      [
        {
          ...base,
          id: 'recent',
          intitule: 'R',
          activites: [{ created_at: '2026-06-10T00:00:00Z' }],
        },
        {
          ...base,
          id: 'vieux',
          intitule: 'V',
          activites: [{ created_at: '2026-05-01T00:00:00Z' }],
        },
      ],
      now,
    );
    expect(r.map((x) => x.intitule)).toEqual(['V', 'R']);
  });
});

describe('statsParCommercial', () => {
  it('agrège opportunités ouvertes et apprentis par owner', () => {
    const s = statsParCommercial([
      { statut: 'ouverte', nb_alternants: 2, owner: { nom_complet: 'Ilias' } },
      { statut: 'ouverte', nb_alternants: 3, owner: { nom_complet: 'Ilias' } },
      { statut: 'ouverte', nb_alternants: 1, owner: { nom_complet: 'Nadir' } },
      { statut: 'gagnee', nb_alternants: 5, owner: { nom_complet: 'Ilias' } },
    ]);
    expect(s).toEqual([
      { nom: 'Ilias', ouvertes: 2, apprentis: 5 },
      { nom: 'Nadir', ouvertes: 1, apprentis: 1 },
    ]);
  });
});
