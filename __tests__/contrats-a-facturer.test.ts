import { describe, it, expect } from 'vitest';
import {
  selectContratsAFacturer,
  selectContratsNonFactures,
  OPCO_NON_RESOLU,
  type AFacturerContratInput,
  type AFacturerStepInput,
} from '@/lib/queries/contrats-a-facturer';

const TODAY = '2026-06-22';

function contrat(
  over: Partial<AFacturerContratInput> = {},
): AFacturerContratInput {
  return {
    id: 'c1',
    ref: 'CTR-001',
    contract_number: '0001',
    apprenant_prenom: 'Nawal',
    apprenant_nom: 'BESSE',
    formation_titre: 'CONSEILLER COMMERCIAL',
    contract_state: 'ENGAGE',
    archive: false,
    facturation_verrouillee: false,
    projet_ref: '0016-HEO-APP',
    client_raison_sociale: 'HEOL ACADEMY',
    ...over,
  };
}

function step(over: Partial<AFacturerStepInput> = {}): AFacturerStepInput {
  return {
    contrat_id: 'c1',
    step_number: 1,
    opening_date: '2026-02-01',
    invoice_state: null,
    total_amount: 3333.2,
    ...over,
  };
}

describe('selectContratsAFacturer', () => {
  it('retient un contrat ENGAGE avec une échéance ouverte non transmise', () => {
    const rows = selectContratsAFacturer({
      contrats: [contrat()],
      steps: [step()],
      opcoByContratId: new Map([['c1', 'AKTO']]),
      today: TODAY,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      contratId: 'c1',
      contractNumber: '0001',
      apprenti: 'Nawal BESSE',
      formationTitre: 'CONSEILLER COMMERCIAL',
      projetRef: '0016-HEO-APP',
      clientRaisonSociale: 'HEOL ACADEMY',
      opco: 'AKTO',
      stepNumber: 1,
      openingDate: '2026-02-01',
      montant: 3333.2,
      echeancesDuesCount: 1,
    });
    expect(rows[0]!.retardJours).toBeGreaterThan(100);
  });

  it('exclut une échéance future', () => {
    const rows = selectContratsAFacturer({
      contrats: [contrat()],
      steps: [step({ opening_date: '2026-08-01' })],
      opcoByContratId: new Map(),
      today: TODAY,
    });
    expect(rows).toHaveLength(0);
  });

  it('exclut une échéance déjà transmise (invoice_state non null)', () => {
    const rows = selectContratsAFacturer({
      contrats: [contrat()],
      steps: [step({ invoice_state: 'TRANSMIS' })],
      opcoByContratId: new Map(),
      today: TODAY,
    });
    expect(rows).toHaveLength(0);
  });

  it.each(['NOTSENT', 'ANNULE', 'RUPTURE', 'ARCHIVE', 'EN_COURS_INSTRUCTION'])(
    'exclut un contrat en état %s',
    (state) => {
      const rows = selectContratsAFacturer({
        contrats: [contrat({ contract_state: state })],
        steps: [step()],
        opcoByContratId: new Map(),
        today: TODAY,
      });
      expect(rows).toHaveLength(0);
    },
  );

  it('retient un contrat TRANSMIS (état facturable)', () => {
    const rows = selectContratsAFacturer({
      contrats: [contrat({ contract_state: 'TRANSMIS' })],
      steps: [step()],
      opcoByContratId: new Map(),
      today: TODAY,
    });
    expect(rows).toHaveLength(1);
  });

  it('exclut un contrat archivé ou verrouillé', () => {
    expect(
      selectContratsAFacturer({
        contrats: [contrat({ archive: true })],
        steps: [step()],
        opcoByContratId: new Map(),
        today: TODAY,
      }),
    ).toHaveLength(0);
    expect(
      selectContratsAFacturer({
        contrats: [contrat({ facturation_verrouillee: true })],
        steps: [step()],
        opcoByContratId: new Map(),
        today: TODAY,
      }),
    ).toHaveLength(0);
  });

  it('regroupe plusieurs échéances dues en une ligne, choisit la plus ancienne', () => {
    const rows = selectContratsAFacturer({
      contrats: [contrat()],
      steps: [
        step({ step_number: 2, opening_date: '2026-05-01', total_amount: 500 }),
        step({
          step_number: 1,
          opening_date: '2026-02-01',
          total_amount: 3333.2,
        }),
      ],
      opcoByContratId: new Map(),
      today: TODAY,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.echeancesDuesCount).toBe(2);
    expect(rows[0]!.stepNumber).toBe(1);
    expect(rows[0]!.openingDate).toBe('2026-02-01');
    expect(rows[0]!.montant).toBe(3333.2);
  });

  it('trie du plus en retard au moins', () => {
    const rows = selectContratsAFacturer({
      contrats: [
        contrat({ id: 'recent', ref: 'CTR-recent' }),
        contrat({ id: 'old', ref: 'CTR-old' }),
      ],
      steps: [
        step({ contrat_id: 'recent', opening_date: '2026-05-01' }),
        step({ contrat_id: 'old', opening_date: '2026-01-01' }),
      ],
      opcoByContratId: new Map(),
      today: TODAY,
    });
    expect(rows.map((r) => r.contratId)).toEqual(['old', 'recent']);
  });

  it("résout l'OPCO via la map, fallback Non résolu", () => {
    const rows = selectContratsAFacturer({
      contrats: [contrat()],
      steps: [step()],
      opcoByContratId: new Map(),
      today: TODAY,
    });
    expect(rows[0]!.opco).toBe(OPCO_NON_RESOLU);
  });

  it('ignore une échéance sans opening_date', () => {
    const rows = selectContratsAFacturer({
      contrats: [contrat()],
      steps: [step({ opening_date: null })],
      opcoByContratId: new Map(),
      today: TODAY,
    });
    expect(rows).toHaveLength(0);
  });

  it("retient une échéance dont l'ouverture est exactement aujourd'hui (retard 0)", () => {
    const rows = selectContratsAFacturer({
      contrats: [contrat()],
      steps: [step({ opening_date: TODAY })],
      opcoByContratId: new Map(),
      today: TODAY,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.retardJours).toBe(0);
  });

  it('ignore une échéance dont le contrat est absent de la liste éligible', () => {
    const rows = selectContratsAFacturer({
      contrats: [],
      steps: [step()],
      opcoByContratId: new Map(),
      today: TODAY,
    });
    expect(rows).toHaveLength(0);
  });
});

describe('selectContratsNonFactures', () => {
  it('inclut une échéance à venir, statut a_venir, retard 0', () => {
    const rows = selectContratsNonFactures({
      contrats: [contrat()],
      steps: [step({ opening_date: '2026-12-01' })],
      opcoByContratId: new Map([['c1', 'AKTO']]),
      cdpNomByContratId: new Map([['c1', 'Ilies Ladj']]),
      today: TODAY,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      statut: 'a_venir',
      retardJours: 0,
      opco: 'AKTO',
      cdpNom: 'Ilies Ladj',
      nonTransmisCount: 1,
      prochaineEcheance: '2026-12-01',
    });
  });

  it('statut echu + retard pour une échéance passée', () => {
    const rows = selectContratsNonFactures({
      contrats: [contrat()],
      steps: [step({ opening_date: '2026-02-01' })],
      opcoByContratId: new Map(),
      cdpNomByContratId: new Map(),
      today: TODAY,
    });
    expect(rows[0]!.statut).toBe('echu');
    expect(rows[0]!.retardJours).toBeGreaterThan(100);
  });

  it('exclut les steps transmis et les contrats inéligibles', () => {
    expect(
      selectContratsNonFactures({
        contrats: [contrat()],
        steps: [step({ invoice_state: 'REGLE' })],
        opcoByContratId: new Map(),
        cdpNomByContratId: new Map(),
        today: TODAY,
      }),
    ).toHaveLength(0);
    expect(
      selectContratsNonFactures({
        contrats: [contrat({ contract_state: 'ANNULE' })],
        steps: [step()],
        opcoByContratId: new Map(),
        cdpNomByContratId: new Map(),
        today: TODAY,
      }),
    ).toHaveLength(0);
  });

  it('agrège montant + count, prochaine = plus ancienne, statut echu si une échue', () => {
    const rows = selectContratsNonFactures({
      contrats: [contrat()],
      steps: [
        step({
          step_number: 1,
          opening_date: '2026-02-01',
          total_amount: 1000,
        }),
        step({ step_number: 2, opening_date: '2026-12-01', total_amount: 500 }),
      ],
      opcoByContratId: new Map(),
      cdpNomByContratId: new Map(),
      today: TODAY,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      nonTransmisCount: 2,
      montantNonTransmis: 1500,
      prochaineEcheance: '2026-02-01',
      statut: 'echu',
    });
  });

  it('trie les échus avant les à venir', () => {
    const rows = selectContratsNonFactures({
      contrats: [
        contrat({ id: 'fut', ref: 'CTR-fut' }),
        contrat({ id: 'echu', ref: 'CTR-echu' }),
      ],
      steps: [
        step({ contrat_id: 'fut', opening_date: '2026-12-01' }),
        step({ contrat_id: 'echu', opening_date: '2026-03-01' }),
      ],
      opcoByContratId: new Map(),
      cdpNomByContratId: new Map(),
      today: TODAY,
    });
    expect(rows.map((r) => r.contratId)).toEqual(['echu', 'fut']);
  });

  it('cdpNom absent -> null ; opco fallback Non résolu', () => {
    const rows = selectContratsNonFactures({
      contrats: [contrat()],
      steps: [step()],
      opcoByContratId: new Map(),
      cdpNomByContratId: new Map(),
      today: TODAY,
    });
    expect(rows[0]!.cdpNom).toBeNull();
    expect(rows[0]!.opco).toBe(OPCO_NON_RESOLU);
  });
});
