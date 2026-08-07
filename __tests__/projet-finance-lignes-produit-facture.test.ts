process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi } from 'vitest';

/**
 * Tests du decompte ligne a ligne "Produit" et "Facture" des deux flux
 * (lib/queries/projet-finance-detail.ts) : construireLignesProduit,
 * construireLignesFactureOpco, construireLignesFactureCommission.
 */

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import {
  construireLignesProduit,
  construireLignesFactureOpco,
  construireLignesFactureCommission,
} from '@/lib/queries/projet-finance-detail';
import type { JalonOpco } from '@/lib/projets/finance-flux';

describe('construireLignesProduit', () => {
  it('produit une ligne par contrat non archive, avec produit OPCO et commission derivee', () => {
    const r = construireLignesProduit(
      [
        {
          id: 'c1',
          ref: 'CTR-0001',
          contract_number: null,
          apprenant_prenom: 'Jean',
          apprenant_nom: 'Dupont',
          formation_titre: 'Titre Pro',
          archive: false,
          npec_amount: 6000,
          date_debut: '2026-01-01',
          duree_mois: 12,
          date_rupture: null,
        },
      ],
      40,
    );
    expect(r.opco).toHaveLength(1);
    expect(r.commission).toHaveLength(1);
    // Contrat sain sur 12 mois, NPEC 6000 : le schedule OPCO complet vaut 6000.
    expect(r.opco[0]!.montant).toBe(6000);
    expect(r.commission[0]!.montant).toBeGreaterThan(0);
  });

  it('exclut les contrats archives', () => {
    const r = construireLignesProduit(
      [
        {
          id: 'c1',
          ref: 'CTR-0001',
          contract_number: null,
          apprenant_prenom: null,
          apprenant_nom: null,
          formation_titre: null,
          archive: true,
          npec_amount: 6000,
          date_debut: '2026-01-01',
          duree_mois: 12,
          date_rupture: null,
        },
      ],
      40,
    );
    expect(r.opco).toHaveLength(0);
    expect(r.commission).toHaveLength(0);
  });

  it('rend 0 quand les donnees necessaires manquent (duree ou NPEC)', () => {
    const r = construireLignesProduit(
      [
        {
          id: 'c1',
          ref: 'CTR-0001',
          contract_number: null,
          apprenant_prenom: null,
          apprenant_nom: null,
          formation_titre: null,
          archive: false,
          npec_amount: null,
          date_debut: '2026-01-01',
          duree_mois: 12,
          date_rupture: null,
        },
      ],
      40,
    );
    expect(r.opco[0]!.montant).toBe(0);
    expect(r.commission[0]!.montant).toBe(0);
  });

  it('proratise le produit d un contrat rompu', () => {
    const r = construireLignesProduit(
      [
        {
          id: 'c1',
          ref: 'CTR-0001',
          contract_number: null,
          apprenant_prenom: null,
          apprenant_nom: null,
          formation_titre: null,
          archive: false,
          npec_amount: 6000,
          date_debut: '2026-01-01',
          duree_mois: 12,
          date_rupture: '2026-07-01',
        },
      ],
      40,
    );
    // Rupture a 6 mois sur 12 -> moitie du NPEC.
    expect(r.opco[0]!.montant).toBe(3000);
  });
});

describe('construireLignesFactureOpco', () => {
  function jalon(over: Partial<JalonOpco> = {}): JalonOpco {
    return {
      id: 'j1',
      contratId: 'c1',
      stepNumber: 1,
      openingDate: '2026-01-01',
      invoiceState: null,
      totalAmount: 1000,
      paidAmount: 0,
      opcoSettledAmount: 0,
      invoiceSentAt: null,
      ...over,
    };
  }

  it('ne garde que les jalons transmis ou regles', () => {
    const r = construireLignesFactureOpco(
      [
        jalon({
          id: 'a',
          invoiceState: 'TRANSMIS',
          invoiceSentAt: '2026-01-01T00:00:00Z',
        }),
        jalon({
          id: 'b',
          invoiceState: 'REGLE',
          invoiceSentAt: '2026-01-01T00:00:00Z',
        }),
        jalon({ id: 'c', invoiceState: null }),
      ],
      new Map([['c1', { ref: 'CTR-0001' }]]),
    );
    expect(r.map((l) => l.id)).toEqual(['a', 'b']);
    expect(r[0]!.montant).toBe(1000);
  });
});

describe('construireLignesFactureCommission', () => {
  it('garde le montant tel que stocke, negatif pour un avoir', () => {
    const r = construireLignesFactureCommission([
      {
        id: 'f1',
        ref: 'FAC-SOL-0001',
        montant_ht: 1000,
        date_emission: '2026-01-01',
        date_echeance: '2026-02-01',
        statut: 'emise',
      },
      {
        id: 'f2',
        ref: 'AVR-SOL-0001',
        montant_ht: -200,
        date_emission: '2026-03-01',
        date_echeance: '2026-03-01',
        statut: 'avoir',
      },
    ]);
    expect(r[0]!.montant).toBe(1000);
    expect(r[1]!.montant).toBe(-200);
  });
});
