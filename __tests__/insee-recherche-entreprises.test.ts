import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeSiren,
  lookupEntrepriseBySiren,
} from '@/lib/insee/recherche-entreprises';

describe('normalizeSiren', () => {
  it('retire les espaces et garde 9 chiffres', () => {
    expect(normalizeSiren('123 456 789')).toBe('123456789');
    expect(normalizeSiren('  123456789 ')).toBe('123456789');
  });

  it('rejette un nombre de chiffres incorrect', () => {
    expect(normalizeSiren('12345678')).toBeNull(); // 8 chiffres
    expect(normalizeSiren('1234567890')).toBeNull(); // 10 chiffres
  });

  it('rejette les caractères non numériques', () => {
    expect(normalizeSiren('abc')).toBeNull();
    expect(normalizeSiren('12345678A')).toBeNull();
  });

  it('rejette null / undefined', () => {
    expect(normalizeSiren(null)).toBeNull();
    expect(normalizeSiren(undefined)).toBeNull();
  });
});

describe('lookupEntrepriseBySiren', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    // Restaure le vrai fetch : aucun mock ne fuit vers les autres suites.
    vi.unstubAllGlobals();
  });

  it('renvoie null SANS appeler fetch quand le SIREN est invalide', async () => {
    const res = await lookupEntrepriseBySiren('12345678'); // 8 chiffres
    expect(res).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renvoie null quand la réponse HTTP n'est pas OK", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    const res = await lookupEntrepriseBySiren('123456789');
    expect(res).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('renvoie null quand aucun résultat', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    expect(await lookupEntrepriseBySiren('123456789')).toBeNull();
  });

  it('renvoie null quand le SIREN renvoyé ne correspond pas (anti faux positif)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ siren: '999999999', nom_complet: 'Autre société' }],
      }),
    });
    expect(await lookupEntrepriseBySiren('123456789')).toBeNull();
  });

  it('mappe les champs INSEE en EntrepriseInsee sur le chemin nominal', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            siren: '123456789',
            nom_complet: 'SOLUVIA SAS',
            nom_raison_sociale: 'SOLUVIA',
            nature_juridique: '5710',
            activite_principale: '70.22Z',
            tranche_effectif_salarie: '42',
            siege: {
              siret: '12345678900012',
              adresse: '1 RUE DU TEST 75001 PARIS',
            },
          },
        ],
      }),
    });

    const res = await lookupEntrepriseBySiren('123456789');
    expect(res).toEqual({
      siren: '123456789',
      raisonSociale: 'SOLUVIA SAS',
      siret: '12345678900012',
      adresse: '1 RUE DU TEST 75001 PARIS',
      formeJuridique: '5710',
      codeNaf: '70.22Z',
      effectifTranche: '1 000 à 1 999 salariés', // tranche INSEE code '42'
    });
  });

  it("normalise le SIREN d'entrée (espaces) et tolère un siège vide", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { siren: '123456789', nom_complet: 'SOLUVIA SAS', siege: {} },
        ],
      }),
    });
    const res = await lookupEntrepriseBySiren('123 456 789');
    expect(res?.siren).toBe('123456789');
    expect(res?.raisonSociale).toBe('SOLUVIA SAS');
    expect(res?.siret).toBeNull();
    expect(res?.adresse).toBeNull();
    expect(res?.effectifTranche).toBeNull();
  });
});
