import { describe, it, expect } from 'vitest';
import { rdvSchema } from './rdv';
import { relanceSchema } from './relance';

describe('rdvSchema', () => {
  it('rejette une fin antérieure au début', () => {
    expect(() =>
      rdvSchema.parse({
        titre: 'RDV',
        debut: '2026-06-24T10:00',
        fin: '2026-06-24T09:00',
      }),
    ).toThrow();
  });
  it('accepte une fin postérieure et défaut commerciaux = []', () => {
    const r = rdvSchema.parse({
      titre: 'RDV',
      debut: '2026-06-24T10:00',
      fin: '2026-06-24T11:00',
    });
    expect(r.commerciaux).toEqual([]);
  });
});

describe('relanceSchema', () => {
  it('exige titre et échéance', () => {
    expect(() =>
      relanceSchema.parse({ titre: '', date_echeance: '2026-06-25' }),
    ).toThrow();
    expect(() =>
      relanceSchema.parse({ titre: 'Rappel', date_echeance: '' }),
    ).toThrow();
  });
  it('priorité par défaut = normale et compte_id vide -> null', () => {
    const r = relanceSchema.parse({
      titre: 'Rappel',
      date_echeance: '2026-06-25',
      compte_id: '',
    });
    expect(r.priorite).toBe('normale');
    expect(r.compte_id).toBeNull();
  });
});
