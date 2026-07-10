import { describe, it, expect } from 'vitest';
import {
  computeEcheancierDues,
  currentMoisCutoff,
  type EcheancierProjetInput,
  type EcheancierContratInput,
  type EcheancierTemplateInput,
} from '@/lib/queries/echeancier-dues';

// Template 12 x 1/12 (modele "1/12 par mois")
const DOUZIEMES: EcheancierTemplateInput = {
  id: 'tpl-default',
  nom: '12 douzièmes',
  jalons: Array.from({ length: 12 }, (_, i) => ({
    mois_relatif: i + 1,
    quote_part: 1 / 12,
  })),
  is_default: true,
};

function projet(
  overrides: Partial<EcheancierProjetInput> = {},
): EcheancierProjetInput {
  return {
    id: 'p1',
    ref: '0017-FOR-APP',
    taux_commission: 10,
    echeancier_template_id: null,
    echeancier_override: null,
    client_id: 'c1',
    client_raison_sociale: 'FORMA QHRC',
    ...overrides,
  };
}

function contrat(
  overrides: Partial<EcheancierContratInput> = {},
): EcheancierContratInput {
  return {
    id: 'k1',
    projet_id: 'p1',
    ref: 'CTR-00001',
    contract_number: 'DECA-123',
    apprenant_prenom: 'Jean',
    apprenant_nom: 'Dupont',
    formation_titre: 'CAP Cuisine',
    contract_state: 'ENGAGE',
    npec_amount: 12_000,
    date_debut: '2026-04-15',
    duree_mois: 12,
    archive: false,
    ...overrides,
  };
}

// NPEC 12000 x 10% = 1200 de commission, soit 100/mois en 1/12.
// date_debut avril 2026 -> jalons M+1=mai, M+2=juin, M+3=juillet...

describe('computeEcheancierDues', () => {
  it('propose les jalons dus a date, rien au-dela du cutoff', () => {
    const dues = computeEcheancierDues({
      projets: [projet()],
      contrats: [contrat()],
      templates: [DOUZIEMES],
      billedByContrat: new Map(),
      cutoffMois: '2026-07-01',
    });
    expect(dues).toHaveLength(3); // mai, juin, juillet
    expect(dues.map((d) => d.moisConcerne)).toEqual([
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
    ]);
    for (const d of dues) expect(d.montantHt).toBe(100);
    expect(dues[0]!.tauxCommission).toBe(10);
    expect(dues[0]!.templateNom).toBe('12 douzièmes');
  });

  it('deduit le deja-facture en montant, jalons les plus anciens d abord', () => {
    // 150 deja factures : M+1 (100) consomme, M+2 partiel (50 dus), M+3 entier
    const dues = computeEcheancierDues({
      projets: [projet()],
      contrats: [contrat()],
      templates: [DOUZIEMES],
      billedByContrat: new Map([['k1', 150]]),
      cutoffMois: '2026-07-01',
    });
    expect(dues.map((d) => [d.moisConcerne, d.montantHt])).toEqual([
      ['2026-06-01', 50],
      ['2026-07-01', 100],
    ]);
  });

  it('gere les lignes manuelles cumulees (M+1..M+2 en une ligne)', () => {
    // L ancien dialog emettait 200 (2 mois cumules) sur une seule ligne :
    // la deduction en montant ne double-propose pas ces deux mois.
    const dues = computeEcheancierDues({
      projets: [projet()],
      contrats: [contrat()],
      templates: [DOUZIEMES],
      billedByContrat: new Map([['k1', 200]]),
      cutoffMois: '2026-07-01',
    });
    expect(dues).toHaveLength(1);
    expect(dues[0]!.moisConcerne).toBe('2026-07-01');
  });

  it('ne propose rien si tout est deja facture (ou sur-facture)', () => {
    const dues = computeEcheancierDues({
      projets: [projet()],
      contrats: [contrat()],
      templates: [DOUZIEMES],
      billedByContrat: new Map([['k1', 1200]]),
      cutoffMois: '2026-07-01',
    });
    expect(dues).toHaveLength(0);
  });

  it('exclut contrats rompus, archives, sans date ou sans NPEC', () => {
    const dues = computeEcheancierDues({
      projets: [projet()],
      contrats: [
        contrat({ id: 'k1', contract_state: 'resilie' }),
        contrat({ id: 'k2', archive: true }),
        contrat({ id: 'k3', date_debut: null }),
        contrat({ id: 'k4', npec_amount: 0 }),
      ],
      templates: [DOUZIEMES],
      billedByContrat: new Map(),
      cutoffMois: '2026-07-01',
    });
    expect(dues).toHaveLength(0);
  });

  it('ne depasse pas la duree du contrat', () => {
    const dues = computeEcheancierDues({
      projets: [projet()],
      contrats: [contrat({ duree_mois: 2 })],
      templates: [DOUZIEMES],
      billedByContrat: new Map(),
      cutoffMois: '2027-01-01',
    });
    // Seuls M+1 et M+2 existent, meme avec un cutoff lointain
    expect(dues.map((d) => d.moisConcerne)).toEqual([
      '2026-05-01',
      '2026-06-01',
    ]);
  });

  it('respecte un override local au projet', () => {
    const dues = computeEcheancierDues({
      projets: [
        projet({
          echeancier_override: [
            { mois_relatif: 1, quote_part: 0.25 },
            { mois_relatif: 2, quote_part: 0.75 },
          ],
        }),
      ],
      contrats: [contrat()],
      templates: [DOUZIEMES],
      billedByContrat: new Map(),
      cutoffMois: '2026-07-01',
    });
    expect(dues.map((d) => [d.moisConcerne, d.montantHt])).toEqual([
      ['2026-05-01', 300],
      ['2026-06-01', 900],
    ]);
    expect(dues[0]!.templateSource).toBe('override');
  });

  it('agrege plusieurs contrats du meme projet par mois', () => {
    const dues = computeEcheancierDues({
      projets: [projet()],
      contrats: [
        contrat({ id: 'k1' }),
        contrat({ id: 'k2', ref: 'CTR-00002', date_debut: '2026-04-01' }),
      ],
      templates: [DOUZIEMES],
      billedByContrat: new Map(),
      cutoffMois: '2026-05-01',
    });
    expect(dues).toHaveLength(1);
    expect(dues[0]!.montantHt).toBe(200);
    expect(dues[0]!.contributions).toHaveLength(2);
  });

  it('ignore les reliquats d arrondi < 1 centime', () => {
    const dues = computeEcheancierDues({
      projets: [projet()],
      contrats: [contrat()],
      templates: [DOUZIEMES],
      billedByContrat: new Map([['k1', 99.995]]),
      cutoffMois: '2026-05-01',
    });
    expect(dues).toHaveLength(0);
  });
});

describe('currentMoisCutoff', () => {
  it('retourne le 1er du mois courant en UTC', () => {
    expect(currentMoisCutoff(new Date(Date.UTC(2026, 6, 10)))).toBe(
      '2026-07-01',
    );
  });
});
