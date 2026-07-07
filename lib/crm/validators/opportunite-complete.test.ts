import { describe, it, expect } from 'vitest';
import { opportuniteCompleteSchema } from './opportunite-complete';

const base = {
  societe_nom: 'Acme',
  contacts: [{ prenom: 'Jean', nom: 'Dupont', email: '', telephone: '' }],
};

describe('opportuniteCompleteSchema', () => {
  it('accepte une saisie minimale valide', () => {
    const r = opportuniteCompleteSchema.parse(base);
    expect(r.societe_nom).toBe('Acme');
    expect(r.contacts).toHaveLength(1);
    expect(r.nombre_collaborateurs).toBeNull();
    expect(r.nb_alternants).toBeNull();
  });
  it('rejette une société vide', () => {
    expect(() =>
      opportuniteCompleteSchema.parse({ ...base, societe_nom: '' }),
    ).toThrow();
  });
  it('exige au moins un contact avec un nom', () => {
    expect(() =>
      opportuniteCompleteSchema.parse({
        ...base,
        contacts: [{ prenom: 'X', nom: '', email: '', telephone: '' }],
      }),
    ).toThrow();
  });
  it('rejette un tableau de contacts vide', () => {
    expect(() =>
      opportuniteCompleteSchema.parse({ ...base, contacts: [] }),
    ).toThrow();
  });
  it('coerce les nombres et vide -> null', () => {
    const r = opportuniteCompleteSchema.parse({
      ...base,
      nombre_collaborateurs: '12',
      nb_alternants: '',
    });
    expect(r.nombre_collaborateurs).toBe(12);
    expect(r.nb_alternants).toBeNull();
  });
  it('rejette un email de contact invalide mais accepte vide', () => {
    expect(() =>
      opportuniteCompleteSchema.parse({
        ...base,
        contacts: [{ nom: 'Dupont', email: 'bad', prenom: '', telephone: '' }],
      }),
    ).toThrow();
    const r = opportuniteCompleteSchema.parse({
      ...base,
      contacts: [{ nom: 'Dupont', email: '', prenom: '', telephone: '' }],
    });
    expect(r.contacts[0]!.email).toBe('');
  });
  it('vide la date cible -> null', () => {
    expect(
      opportuniteCompleteSchema.parse({ ...base, date_cible_prochain_rdv: '' })
        .date_cible_prochain_rdv,
    ).toBeNull();
  });
});
