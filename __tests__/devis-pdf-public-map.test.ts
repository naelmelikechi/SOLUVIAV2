import { describe, it, expect, vi } from 'vitest';

// @/lib/queries/devis importe @/lib/supabase/server (-> next/headers) au top.
// mapDevisPdfPublic est pure : on neutralise la chaine serveur pour l'importer.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { mapDevisPdfPublic, type DevisPdfData } from '@/lib/queries/devis';

// Payload representatif de la sortie JSON de get_devis_pdf_public.
function rpcPayload(overrides: Record<string, unknown> = {}) {
  return {
    devis: {
      ref: 'DEV-SOL-0007',
      objet: 'Prestation de conseil',
      date_emission: '2026-06-01',
      date_validite: '2026-08-30',
      montant_ht: 2000,
      montant_ttc: 2400,
      conditions_reglement: 'Virement à 30 jours',
    },
    lignes: [
      {
        ordre: 1,
        libelle: 'Audit',
        description: 'Audit initial',
        quantite: 1,
        prix_unitaire_ht: 1000,
        taux_tva: 20,
        total_ht: 1000,
        total_tva: 200,
      },
      {
        ordre: 2,
        libelle: 'Formation',
        description: null,
        quantite: 2,
        prix_unitaire_ht: 500,
        taux_tva: 20,
        total_ht: 1000,
        total_tva: 200,
      },
    ],
    societe: {
      raison_sociale: 'S.A.S. SOLUVIA',
      forme_juridique: 'SAS',
      capital_social: 10000,
      siret: '99424153700012',
      tva_intracom: 'FR37994241537',
      adresse: '27 Rue Jacqueline Cochran',
      code_postal: '79000',
      ville: 'Niort',
      logo_url: null,
      conditions_reglement_default: 'Virement bancaire',
      mentions_legales: 'SAS SOLUVIA - SIRET 99424153700012',
      banque_nom: 'Qonto',
      banque_iban: 'FR7612345678901234567890123',
      banque_bic: 'QNTOFRP1XXX',
    },
    client: {
      raison_sociale: 'DUPONT FORMATION',
      adresse: '5 rue des Lilas',
      localisation: '75011 Paris',
      siret: '12345678900012',
      tva_intracommunautaire: 'FR12345678901',
    },
    ...overrides,
  };
}

describe('mapDevisPdfPublic', () => {
  it('mappe un payload RPC complet vers DevisPdfData (societe -> societe_emettrice)', () => {
    const result = mapDevisPdfPublic(rpcPayload());
    expect(result.ref).toBe('DEV-SOL-0007');
    expect(result.objet).toBe('Prestation de conseil');
    expect(result.montant_ttc).toBe(2400);
    expect(result.conditions_reglement).toBe('Virement à 30 jours');
    expect(result.lignes).toHaveLength(2);
    expect(result.lignes[0]?.libelle).toBe('Audit');
    expect(result.lignes[1]?.description).toBeNull();
    // La cle SQL `societe` est renommee `societe_emettrice` (contrat du composant).
    expect(result.societe_emettrice?.raison_sociale).toBe('S.A.S. SOLUVIA');
    expect(result.societe_emettrice?.banque_iban).toBe(
      'FR7612345678901234567890123',
    );
    expect(result.client?.siret).toBe('12345678900012');
  });

  it('accepte societe et client null (row_to_json sur RECORD introuvable)', () => {
    const result = mapDevisPdfPublic(
      rpcPayload({ societe: null, client: null }),
    );
    expect(result.societe_emettrice).toBeNull();
    expect(result.client).toBeNull();
  });

  it('accepte une liste de lignes vide', () => {
    const result = mapDevisPdfPublic(rpcPayload({ lignes: [] }));
    expect(result.lignes).toEqual([]);
  });

  it('leve si le champ devis est absent', () => {
    const bad = rpcPayload();
    delete (bad as Record<string, unknown>).devis;
    expect(() => mapDevisPdfPublic(bad)).toThrow();
  });

  it('leve si un montant est une string (forme incoherente)', () => {
    const bad = rpcPayload();
    (bad.devis as Record<string, unknown>).montant_ht = '2000';
    expect(() => mapDevisPdfPublic(bad)).toThrow();
  });

  it('leve sur null (cas gere par la route via 404)', () => {
    expect(() => mapDevisPdfPublic(null)).toThrow();
  });

  it('le resultat est structurellement un DevisPdfData', () => {
    const result: DevisPdfData = mapDevisPdfPublic(rpcPayload());
    expect(result).toHaveProperty('societe_emettrice');
    expect(result).not.toHaveProperty('statut');
  });
});
