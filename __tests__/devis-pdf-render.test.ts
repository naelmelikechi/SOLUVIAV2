import { describe, it, expect, vi } from 'vitest';

/**
 * Tests de rendu reel du PDF devis (@react-pdf/renderer, pas de mock du
 * renderer). Le devis public est rendu a partir de DevisPdfData (projection
 * resserree de la RPC get_devis_pdf_public) : ce test prouve que le type
 * resserre + la cle React basculee sur `ordre` produisent toujours un PDF
 * valide, quelles que soient les donnees (sans RIB, sans SIRET client, sans
 * date de validite...).
 *
 * logo_url: null -> aucun appel reseau (le logo prod est fetch par URL).
 * On valide la structure du buffer (%PDF- ... %%EOF), pas le pixel-perfect.
 */

// render-devis-pdf importe 'server-only' (RSC guard) : inerte en vitest.
vi.mock('server-only', () => ({}));
// @/lib/queries/devis (importe par le composant pour le type) tire
// @/lib/supabase/server -> next/headers : neutralise pour l'import.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { renderDevisPdfBuffer } from '@/lib/utils/render-devis-pdf';
import type { DevisPdfData } from '@/lib/queries/devis';

function ligne(
  overrides: Partial<DevisPdfData['lignes'][number]> = {},
): DevisPdfData['lignes'][number] {
  return {
    ordre: 1,
    libelle: 'Prestation de conseil',
    description: 'Audit des processus qualité',
    quantite: 1,
    prix_unitaire_ht: 1000,
    taux_tva: 20,
    total_ht: 1000,
    total_tva: 200,
    ...overrides,
  };
}

function devisFixture(overrides: Partial<DevisPdfData> = {}): DevisPdfData {
  return {
    ref: 'DEV-SOL-0007',
    objet: 'Accompagnement Qualiopi',
    date_emission: '2026-06-01',
    date_validite: '2026-08-30',
    montant_ht: 2000,
    montant_ttc: 2400,
    conditions_reglement: 'Virement à 30 jours',
    lignes: [ligne(), ligne({ ordre: 2, libelle: 'Formation', quantite: 2 })],
    societe_emettrice: {
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
      mentions_legales:
        'S.A.S. SOLUVIA au capital de 10 000 EUR - SIRET 99424153700012 - TVA FR37994241537',
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

function expectValidPdf(buf: Buffer) {
  expect(buf.length).toBeGreaterThan(1000);
  expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(buf.subarray(-1024).toString('latin1')).toContain('%%EOF');
}

describe('renderDevisPdfBuffer (devis public)', () => {
  it('devis complet -> PDF valide', async () => {
    expectValidPdf(await renderDevisPdfBuffer(devisFixture()));
  });

  it('societe sans RIB (banque_nom null) -> PDF valide', async () => {
    const fixture = devisFixture();
    expectValidPdf(
      await renderDevisPdfBuffer({
        ...fixture,
        societe_emettrice: fixture.societe_emettrice
          ? {
              ...fixture.societe_emettrice,
              banque_nom: null,
              banque_iban: null,
              banque_bic: null,
            }
          : null,
      }),
    );
  });

  it('client sans SIRET ni TVA intracom -> PDF valide', async () => {
    expectValidPdf(
      await renderDevisPdfBuffer(
        devisFixture({
          client: {
            raison_sociale: 'BRUSSELS TRAINING SPRL',
            adresse: 'Rue de la Loi 1',
            localisation: '1000 Bruxelles',
            siret: null,
            tva_intracommunautaire: null,
          },
        }),
      ),
    );
  });

  it('devis sans date_validite -> PDF valide', async () => {
    expectValidPdf(
      await renderDevisPdfBuffer(devisFixture({ date_validite: null })),
    );
  });

  it('societe null (RECORD introuvable) -> PDF valide (fallbacks)', async () => {
    expectValidPdf(
      await renderDevisPdfBuffer(devisFixture({ societe_emettrice: null })),
    );
  });

  it('client null -> PDF valide (mention client non spécifié)', async () => {
    expectValidPdf(await renderDevisPdfBuffer(devisFixture({ client: null })));
  });
});
