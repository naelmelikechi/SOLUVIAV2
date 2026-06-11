// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import { ResteAFacturerTab } from '@/components/facturation/reste-a-facturer-tab';
import { buildResteAFacturer } from '@/lib/utils/reste-a-facturer';
import type {
  ProjetBillableEvents,
  BillableEvent,
  ContratMeta,
} from '@/lib/queries/billable-events';

afterEach(cleanup);

function ev(over: Partial<BillableEvent> = {}): BillableEvent {
  return {
    type: 'opco_step',
    source_id: 's-1',
    contrat_id: 'c1',
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
    contrat_id: 'c1',
    contrat_ref: 'CTR-00001',
    contract_number: 'DECA-001',
    internal_number: 'INT-001',
    apprenant_nom: 'Dupont',
    apprenant_prenom: 'Jean',
    formation_titre: 'Vente',
    contract_state: 'ENGAGE',
    npec_amount: 0,
    support: null,
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

const SAMPLE = projet({
  contrats: [
    ctr({ contrat_id: 'c1', contract_number: 'DECA-001', npec_amount: 10000 }),
    ctr({
      contrat_id: 'c2',
      contract_number: 'DECA-002',
      apprenant_nom: 'Curie',
      apprenant_prenom: 'Marie',
      npec_amount: 8000,
    }),
    ctr({
      contrat_id: 'c3',
      contract_number: 'DECA-003',
      apprenant_nom: 'Pascal',
      apprenant_prenom: 'Blaise',
      npec_amount: 5000,
    }),
  ],
  events: [
    ev({
      contrat_id: 'c1',
      source_id: 's1',
      status: 'available',
      montant_commissionne: 1200,
    }),
    ev({
      contrat_id: 'c3',
      source_id: 's3',
      status: 'locked',
      lock_reason: 'missing_idcc',
      montant_commissionne: 600,
    }),
  ],
});

describe('ResteAFacturerTab', () => {
  it('affiche les 3 cartes de synthèse et la vue par contrat par défaut', () => {
    render(<ResteAFacturerTab raf={buildResteAFacturer([SAMPLE])} />);

    expect(screen.getByText('Facturable maintenant')).toBeDefined();
    expect(screen.getAllByText('Bloqué').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Prévisionnel contractuel')).toBeDefined();

    // Vue par contrat active : champ de recherche dédié + lignes apprenants
    expect(screen.getByPlaceholderText(/Rechercher un contrat/i)).toBeDefined();
    expect(screen.getByText('Jean Dupont')).toBeDefined();
    expect(screen.getByText('Blaise Pascal')).toBeDefined();
  });

  it('bascule vers la vue par projet', () => {
    render(<ResteAFacturerTab raf={buildResteAFacturer([SAMPLE])} />);

    fireEvent.click(screen.getByText('Par projet'));
    expect(screen.getByPlaceholderText(/Rechercher un projet/i)).toBeDefined();
    // Les chips de focus (Tous/Facturable/...) n'existent qu'en vue contrat
    expect(screen.queryByText('Tous')).toBeNull();
  });

  it('filtre la vue contrat sur les seuls événements bloqués', () => {
    render(<ResteAFacturerTab raf={buildResteAFacturer([SAMPLE])} />);

    // Avant filtre : l'apprenant facturable est visible
    expect(screen.getByText('Jean Dupont')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Bloqué' }));
    // Après focus "Bloqué" : seul le contrat bloqué (Blaise Pascal) reste
    expect(screen.getByText('Blaise Pascal')).toBeDefined();
    expect(screen.queryByText('Jean Dupont')).toBeNull();
  });

  it('affiche un état vide quand il n y a rien à facturer', () => {
    render(<ResteAFacturerTab raf={buildResteAFacturer([])} />);
    expect(screen.getByText(/Rien à facturer/i)).toBeDefined();
  });
});
