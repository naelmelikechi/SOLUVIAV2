import { describe, it, expect } from 'vitest';

import { buildResteAFacturer } from '@/lib/utils/reste-a-facturer';
import type {
  ProjetBillableEvents,
  BillableEvent,
  ContratMeta,
} from '@/lib/queries/billable-events';

// ---------------------------------------------------------------------------
// Tests pour lib/utils/reste-a-facturer.ts (agrégation pure du reste à
// facturer). Invariants couverts :
//  - facturable/bloqué/déjà facturé = somme des events par statut
//  - conversion HT depuis montant_commissionne (TTC) selon régime TVA
//  - prévisionnel = max(0, npec×taux/100 - émis), actif uniquement
//  - contrat event-less actif -> prévisionnel plein, facturable 0
//  - totals == somme des lignes affichées (WYSIWYG)
//  - groupements parProjet / parOpco + comptages
// ---------------------------------------------------------------------------

function ev(over: Partial<BillableEvent> = {}): BillableEvent {
  return {
    type: 'opco_step',
    source_id: 's-1',
    contrat_id: 'ctr-1',
    contrat_ref: 'CTR-00001',
    contract_number: 'DECA-001',
    internal_number: 'INT-001',
    apprenant_nom: 'Dupont',
    apprenant_prenom: 'Jean',
    formation_titre: 'Vente',
    contract_state: 'ENGAGE',
    step_number: 2,
    step_opening_date: null,
    step_paid_at: null,
    invoice_state: 'REGLE',
    opco_code: 'AKTO',
    opco_nom: 'AKTO',
    montant_brut: 0,
    montant_commissionne: 0,
    status: 'available',
    ...over,
  };
}

function ctr(over: Partial<ContratMeta> = {}): ContratMeta {
  return {
    contrat_id: 'ctr-1',
    contrat_ref: 'CTR-00001',
    contract_number: 'DECA-001',
    internal_number: 'INT-001',
    apprenant_nom: 'Dupont',
    apprenant_prenom: 'Jean',
    formation_titre: 'Vente',
    contract_state: 'ENGAGE',
    npec_amount: 0,
    opco_code: 'AKTO',
    opco_nom: 'AKTO',
    pedago_emis_non_paye: 0,
    ...over,
  };
}

function projet(
  over: Partial<ProjetBillableEvents> = {},
): ProjetBillableEvents {
  return {
    projetId: 'pjt-1',
    projetRef: '0007-HEO-APP',
    clientRaisonSociale: 'Heol Formation',
    tauxCommission: 50,
    events: [],
    auditInvoiceIdsBySource: new Map(),
    clientTvaIntracom: null,
    contrats: [],
    ...over,
  };
}

describe('buildResteAFacturer - statuts et conversion HT (domestique 20 %)', () => {
  it('sépare facturable / bloqué / déjà facturé et dérive le HT', () => {
    const p = projet({
      contrats: [ctr({ npec_amount: 10000 })],
      events: [
        ev({ source_id: 'a', status: 'available', montant_commissionne: 1200 }),
        ev({
          source_id: 'b',
          status: 'locked',
          lock_reason: 'missing_idcc',
          montant_commissionne: 600,
        }),
        ev({ source_id: 'c', status: 'billed', montant_commissionne: 240 }),
      ],
    });

    const raf = buildResteAFacturer([p]);
    expect(raf.parContrat).toHaveLength(1);
    const row = raf.parContrat[0]!;

    // TTC -> HT via /1.2
    expect(row.facturableTtc).toBe(1200);
    expect(row.facturableHt).toBe(1000);
    expect(row.bloqueHt).toBe(500);
    expect(row.dejaFactureHt).toBe(200);
    expect(row.nbFacturable).toBe(1);
    expect(row.nbBloque).toBe(1);
    expect(row.lockReasons).toEqual(['missing_idcc']);

    // potentiel = 10000 × 50% = 5000 TTC -> 4166.67 HT
    expect(row.potentielHt).toBe(4166.67);
    // émis TTC = 1200+600+240 = 2040 ; prévisionnel = 2960 TTC -> 2466.67 HT
    expect(row.previsionnelHt).toBe(2466.67);

    expect(raf.totals.facturableHt).toBe(1000);
    expect(raf.totals.bloqueHt).toBe(500);
    expect(raf.totals.dejaFactureHt).toBe(200);
    expect(raf.totals.nbContratsFacturable).toBe(1);
    expect(raf.totals.nbContratsBloque).toBe(1);
    expect(raf.totals.nbProjetsFacturable).toBe(1);
  });
});

describe('buildResteAFacturer - régime TVA intracom (0 %)', () => {
  it('HT == TTC quand le client a un n° TVA intracom UE', () => {
    const p = projet({
      tauxCommission: 50,
      clientTvaIntracom: 'BE0477472701',
      contrats: [ctr({ npec_amount: 4000 })],
      events: [
        ev({ source_id: 'a', status: 'available', montant_commissionne: 1000 }),
      ],
    });
    const row = buildResteAFacturer([p]).parContrat[0]!;
    expect(row.facturableTtc).toBe(1000);
    expect(row.facturableHt).toBe(1000); // pas de division
  });
});

describe('buildResteAFacturer - prévisionnel et état du contrat', () => {
  it('prévisionnel nul sur contrat rompu, facturable conservé', () => {
    const p = projet({
      contrats: [ctr({ npec_amount: 10000, contract_state: 'resilie' })],
      events: [
        ev({ source_id: 'a', status: 'available', montant_commissionne: 1200 }),
        ev({ source_id: 'c', status: 'billed', montant_commissionne: 600 }),
      ],
    });
    const row = buildResteAFacturer([p]).parContrat[0]!;
    expect(row.facturableHt).toBe(1000); // indépendant de l'état
    expect(row.dejaFactureHt).toBe(500);
    expect(row.previsionnelHt).toBe(0); // contrat rompu -> pas de futur
  });

  it('contrat actif sans event -> prévisionnel plein, facturable 0', () => {
    const p = projet({
      tauxCommission: 50,
      contrats: [
        ctr({ npec_amount: 8000, contract_state: 'ENGAGE', opco_code: null }),
      ],
      events: [],
    });
    const row = buildResteAFacturer([p]).parContrat[0]!;
    expect(row.facturableHt).toBe(0);
    expect(row.bloqueHt).toBe(0);
    // 8000 × 50% = 4000 TTC -> 3333.33 HT
    expect(row.previsionnelHt).toBe(3333.33);
    expect(row.potentielHt).toBe(3333.33);
    expect(row.nbFacturable).toBe(0);
  });

  it('en attente de paiement : TRANSMIS capté à part, réduit le prévisionnel', () => {
    const p = projet({
      tauxCommission: 50,
      contrats: [
        ctr({
          npec_amount: 10000,
          contract_state: 'ENGAGE',
          pedago_emis_non_paye: 2000,
        }),
      ],
      events: [
        ev({ source_id: 'a', status: 'available', montant_commissionne: 1200 }),
      ],
    });
    const row = buildResteAFacturer([p]).parContrat[0]!;
    // facturable = 1200 TTC payé -> 1000 HT
    expect(row.facturableHt).toBe(1000);
    // en attente = 2000 (TRANSMIS) × 50% = 1000 TTC -> 833.33 HT
    expect(row.emisNonPayeHt).toBe(833.33);
    // potentiel 5000 TTC ; émis = 1200 payé + 1000 attente ; prévisionnel
    // = 2800 TTC -> 2333.33 HT
    expect(row.previsionnelHt).toBe(2333.33);
    // décomposition : facturable + attente + prévisionnel = potentiel HT
    expect(
      row.facturableHt + row.emisNonPayeHt + row.previsionnelHt,
    ).toBeCloseTo(row.potentielHt, 1);
  });
});

describe('buildResteAFacturer - totaux WYSIWYG', () => {
  it('le total facturable égale la somme des lignes affichées', () => {
    const p = projet({
      tauxCommission: 50,
      contrats: [
        ctr({ contrat_id: 'c1', npec_amount: 0 }),
        ctr({ contrat_id: 'c2', npec_amount: 0 }),
      ],
      events: [
        ev({
          contrat_id: 'c1',
          source_id: 'a',
          status: 'available',
          montant_commissionne: 1000,
        }),
        ev({
          contrat_id: 'c2',
          source_id: 'b',
          status: 'available',
          montant_commissionne: 1000,
        }),
      ],
    });
    const raf = buildResteAFacturer([p]);
    const sumRows = raf.parContrat.reduce((s, r) => s + r.facturableHt, 0);
    // chaque ligne 1000/1.2 = 833.33 ; somme = 1666.66 (et non 1666.67)
    expect(raf.parContrat.every((r) => r.facturableHt === 833.33)).toBe(true);
    expect(raf.totals.facturableHt).toBe(1666.66);
    expect(raf.totals.facturableHt).toBe(Math.round(sumRows * 100) / 100);
  });
});

describe('buildResteAFacturer - groupements', () => {
  it('agrège par projet avec comptages', () => {
    const p = projet({
      contrats: [
        ctr({ contrat_id: 'c1', npec_amount: 0 }),
        ctr({ contrat_id: 'c2', npec_amount: 0 }),
      ],
      events: [
        ev({
          contrat_id: 'c1',
          source_id: 'a',
          status: 'available',
          montant_commissionne: 1200,
        }),
        ev({
          contrat_id: 'c2',
          source_id: 'b',
          status: 'locked',
          lock_reason: 'unknown_opco',
          montant_commissionne: 600,
        }),
      ],
    });
    const raf = buildResteAFacturer([p]);
    expect(raf.parProjet).toHaveLength(1);
    const proj = raf.parProjet[0]!;
    expect(proj.facturableHt).toBe(1000);
    expect(proj.bloqueHt).toBe(500);
    expect(proj.nbContratsFacturable).toBe(1);
    expect(proj.nbContratsBloque).toBe(1);
    expect(proj.nbContrats).toBe(2);
  });

  it('regroupe par OPCO et range les non résolus sous "Non résolu"', () => {
    const p = projet({
      contrats: [
        ctr({ contrat_id: 'c1', opco_code: 'AKTO', opco_nom: 'AKTO' }),
        ctr({ contrat_id: 'c2', opco_code: null, opco_nom: null }),
      ],
      events: [
        ev({
          contrat_id: 'c1',
          source_id: 'a',
          status: 'available',
          opco_code: 'AKTO',
          montant_commissionne: 1200,
        }),
        ev({
          contrat_id: 'c2',
          source_id: 'b',
          status: 'available',
          opco_code: null,
          montant_commissionne: 600,
        }),
      ],
    });
    const raf = buildResteAFacturer([p]);
    const akto = raf.parOpco.find((o) => o.opcoCode === 'AKTO');
    const nonResolu = raf.parOpco.find((o) => o.opcoCode === null);
    expect(akto?.facturableHt).toBe(1000);
    expect(nonResolu?.opcoNom).toBe('Non résolu');
    expect(nonResolu?.facturableHt).toBe(500);
  });
});

describe('buildResteAFacturer - cas limites', () => {
  it('entrée vide -> totaux à zéro et tableaux vides', () => {
    const raf = buildResteAFacturer([]);
    expect(raf.totals.facturableHt).toBe(0);
    expect(raf.totals.previsionnelHt).toBe(0);
    expect(raf.parProjet).toEqual([]);
    expect(raf.parContrat).toEqual([]);
    expect(raf.parOpco).toEqual([]);
  });

  it('agrège les raisons de blocage distinctes et triées', () => {
    const p = projet({
      contrats: [ctr({ npec_amount: 0 })],
      events: [
        ev({
          source_id: 'a',
          status: 'locked',
          lock_reason: 'unknown_opco',
          montant_commissionne: 600,
        }),
        ev({
          source_id: 'b',
          status: 'locked',
          lock_reason: 'missing_idcc',
          montant_commissionne: 600,
        }),
      ],
    });
    const row = buildResteAFacturer([p]).parContrat[0]!;
    expect(row.lockReasons).toEqual(['missing_idcc', 'unknown_opco']);
    expect(row.bloqueHt).toBe(1000); // (600+600)/1.2
    expect(row.nbBloque).toBe(2);
  });
});
