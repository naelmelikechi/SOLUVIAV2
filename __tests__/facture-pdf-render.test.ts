import { describe, it, expect, vi } from 'vitest';

/**
 * Tests de rendu reel du PDF facture (@react-pdf/renderer, pas de mock du
 * renderer). Le document legal envoye aux clients ne doit jamais sortir
 * corrompu, quelles que soient les donnees (raisons sociales longues,
 * factures libres sans contrat, avoirs, intracom, 40 lignes...).
 *
 * logoSrc: null -> aucun appel reseau (le logo prod est fetch par URL).
 * On valide la structure du buffer (%PDF- ... %%EOF), pas le pixel-perfect.
 */

// render-facture-pdf importe 'server-only' (RSC guard) : inerte en vitest.
vi.mock('server-only', () => ({}));

import { renderFacturePdfBuffer } from '@/lib/utils/render-facture-pdf';
import type { FactureDetail } from '@/lib/queries/factures';
import type { EmetteurInfo } from '@/lib/queries/parametres';

type Ligne = FactureDetail['lignes'][number];

function ligne(overrides: Partial<Ligne> = {}): Ligne {
  return {
    id: 'ligne-1',
    contrat_id: 'contrat-1',
    description: 'Commission sur échéance OPCO - mars 2026',
    montant_ht: 1250.5,
    opco_code: 'OPCO_EP',
    contrat: {
      ref: 'CTR-00187',
      contract_number: '0252600877123',
      apprenant_nom: 'Dupont',
      apprenant_prenom: 'Alice',
    },
    ...overrides,
  } as Ligne;
}

function factureFixture(
  overrides: Partial<Record<string, unknown>> = {},
): FactureDetail {
  return {
    id: 'fac-1',
    ref: 'FAC-DUP-0042',
    numero_seq: 42,
    date_emission: '2026-06-01',
    date_echeance: '2026-07-01',
    mois_concerne: '2026-06-01',
    montant_ht: 2501,
    taux_tva: 20,
    montant_tva: 500.2,
    montant_ttc: 3001.2,
    statut: 'emise',
    est_avoir: false,
    avoir_motif: null,
    facture_origine_id: null,
    email_envoye: false,
    created_by: null,
    objet: null,
    conditions_reglement: 'Paiement à 30 jours',
    societe_emettrice_id: null,
    odoo_id: null,
    projet: { id: 'projet-1', ref: '0042-DUP-APP' },
    client: {
      id: 'client-1',
      trigramme: 'DUP',
      raison_sociale: 'DUPONT FORMATION',
      siret: '12345678900012',
      adresse: '5 rue des Lilas',
      localisation: '75011 Paris',
      tva_intracommunautaire: 'FR12345678901',
    },
    lignes: [ligne(), ligne({ id: 'ligne-2', description: 'Ligne 2' })],
    ...overrides,
  } as unknown as FactureDetail;
}

async function renderPdf(
  facture: FactureDetail,
  extra: {
    emetteur?: EmetteurInfo;
    isDraft?: boolean;
    origineRef?: string | null;
  } = {},
): Promise<Buffer> {
  return renderFacturePdfBuffer({ facture, logoSrc: null, ...extra });
}

function expectValidPdf(buf: Buffer) {
  expect(buf.length).toBeGreaterThan(1000);
  expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(buf.subarray(-1024).toString('latin1')).toContain('%%EOF');
}

describe('renderFacturePdfBuffer', () => {
  it('facture de commission (lignes avec contrat) -> PDF valide', async () => {
    const buf = await renderPdf(factureFixture());
    expectValidPdf(buf);
  });

  it('facture libre (aucune ligne rattachée a un contrat) -> PDF valide', async () => {
    const buf = await renderPdf(
      factureFixture({
        lignes: [
          ligne({ contrat_id: null, contrat: null, opco_code: null }),
          ligne({
            id: 'ligne-2',
            contrat_id: null,
            contrat: null,
            opco_code: null,
            description: 'Prestation de conseil - audit processus qualité',
          }),
        ],
      }),
    );
    expectValidPdf(buf);
  });

  it('avoir -> PDF valide', async () => {
    const buf = await renderPdf(
      factureFixture({
        est_avoir: true,
        avoir_motif: 'Rupture de contrat au prorata',
        montant_ht: -1250.5,
        montant_tva: -250.1,
        montant_ttc: -1500.6,
      }),
      { origineRef: 'FAC-DUP-0041' },
    );
    expectValidPdf(buf);
  });

  it('client UE autoliquidation (TVA 0, mention 283-2 CGI) -> PDF valide', async () => {
    const buf = await renderPdf(
      factureFixture({
        taux_tva: 0,
        montant_tva: 0,
        montant_ttc: 2501,
        client: {
          id: 'client-2',
          trigramme: 'BEL',
          raison_sociale: 'BRUSSELS TRAINING SPRL',
          siret: null,
          adresse: 'Rue de la Loi 1',
          localisation: '1000 Bruxelles',
          tva_intracommunautaire: 'BE0123456789',
        },
      }),
    );
    expectValidPdf(buf);
  });

  it('donnees extremes : raison sociale tres longue + 40 lignes -> PDF multi-pages valide', async () => {
    const lignes = Array.from({ length: 40 }, (_, i) =>
      ligne({
        id: `ligne-${i}`,
        description: `Commission échéance ${i + 1} - apprenti(e) avec une description particulièrement longue qui doit wrapper proprement sans casser la mise en page du tableau`,
        contrat: {
          ref: `CTR-${String(i).padStart(5, '0')}`,
          contract_number: `02526008771${String(i).padStart(2, '0')}`,
          apprenant_nom: 'De La Fontaine-Dubois-Lemaire',
          apprenant_prenom: 'Anne-Charlotte-Marguerite',
        },
      }),
    );
    const buf = await renderPdf(
      factureFixture({
        client: {
          id: 'client-3',
          trigramme: 'LON',
          raison_sociale:
            'CENTRE DE FORMATION PROFESSIONNELLE ET DE PROMOTION AGRICOLE DES PAYS DE LA LOIRE - ANTENNE NANTES ATLANTIQUE',
          siret: '98765432100099',
          adresse:
            'Zone Industrielle de la Croix Rouge, Bâtiment C, 3ème étage, Bureau 42',
          localisation: '44300 Nantes',
          tva_intracommunautaire: 'FR98765432100',
        },
        lignes,
      }),
    );
    expectValidPdf(buf);
    // 40 lignes ne tiennent pas sur une page A4 : le buffer doit etre
    // sensiblement plus gros qu'une facture simple.
    const simple = await renderPdf(factureFixture());
    expect(buf.length).toBeGreaterThan(simple.length);
  });

  it('emetteur custom avec RIB et mentions legales parametrees -> PDF valide', async () => {
    const emetteur: EmetteurInfo = {
      raison_sociale: 'S.A.S. SOLUVIA',
      adresse: '27 Rue Jacqueline Cochran, 79000 Niort',
      siret: '994 241 537 00012',
      tva: 'FR37994241537',
      iban: 'FR76 1234 5678 9012 3456 7890 123',
      bic: 'QNTOFRP1XXX',
      banque: 'Qonto',
      titulaire_compte: 'S.A.S. SOLUVIA',
      mentions_legales:
        'S.A.S. SOLUVIA au capital de 10 000 EUR - SIRET 994 241 537 00012 - RCS Niort - TVA FR37994241537',
    };
    const buf = await renderPdf(factureFixture(), { emetteur });
    expectValidPdf(buf);
  });

  it('emetteur avec tva_sur_debits=true -> PDF valide', async () => {
    const emetteur: EmetteurInfo = {
      raison_sociale: 'S.A.S. SOLUVIA',
      adresse: '27 Rue Jacqueline Cochran, 79000 Niort',
      siret: '994 241 537 00012',
      tva: 'FR37994241537',
      iban: null,
      bic: null,
      banque: null,
      titulaire_compte: null,
      tva_sur_debits: true,
    };
    const buf = await renderPdf(factureFixture(), { emetteur });
    expectValidPdf(buf);
  });

  it('avoir avec tva_sur_debits=false -> PDF valide', async () => {
    const emetteur: EmetteurInfo = {
      raison_sociale: 'S.A.S. SOLUVIA',
      adresse: '27 Rue Jacqueline Cochran, 79000 Niort',
      siret: '994 241 537 00012',
      tva: 'FR37994241537',
      iban: null,
      bic: null,
      banque: null,
      titulaire_compte: null,
      tva_sur_debits: false,
    };
    const buf = await renderPdf(
      factureFixture({ est_avoir: true, avoir_motif: 'Rupture' }),
      { emetteur, origineRef: 'FAC-DUP-0041' },
    );
    expectValidPdf(buf);
  });

  it('apercu brouillon (isDraft) -> PDF valide', async () => {
    const buf = await renderPdf(
      factureFixture({ ref: null, numero_seq: null, statut: 'a_emettre' }),
      { isDraft: true },
    );
    expectValidPdf(buf);
  });

  it('facture multi-OPCO (lignes groupees + numerotation continue) -> PDF valide', async () => {
    // Exerce le chemin groupé par opco_code : la numérotation N° doit rester
    // continue (1..N) à travers les groupes sans planter le rendu.
    const buf = await renderPdf(
      factureFixture({
        lignes: [
          ligne({ id: 'l1', opco_code: 'AKTO' }),
          ligne({ id: 'l2', opco_code: 'OPCO_EP' }),
          ligne({ id: 'l3', opco_code: 'OPCO_EP' }),
          ligne({ id: 'l4', opco_code: null }),
        ],
      }),
    );
    expectValidPdf(buf);
  });
});
