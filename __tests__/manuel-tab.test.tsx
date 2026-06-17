// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

// ManuelTab utilise useRouter() et l'action serveur createFactureFromEvents :
// on les neutralise pour un rendu pur dans jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/lib/actions/factures', () => ({
  createFactureFromEvents: vi.fn(),
}));

import { ManuelTab } from '@/components/facturation/manuel-tab';
import type {
  ProjetBillableEvents,
  BillableEvent,
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
    external_number: null,
    invoice_number: null,
    opco_settled_amount: null,
    net_invoiced_amount: null,
    opco_code: 'AKTO',
    opco_nom: 'AKTO',
    montant_brut: 2400,
    montant_commissionne: 1200,
    status: 'available',
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

describe('ManuelTab - colonnes HT / TTC', () => {
  it('client domestique : montant_commissionne (TTC) -> HT dérivé, TTC inchangé', () => {
    const { container } = render(
      <ManuelTab
        projets={[projet({ events: [ev({ montant_commissionne: 1200 })] })]}
      />,
    );
    const txt = (container.textContent ?? '').replace(/[\u202f\u00a0]/g, ' ');
    // montant_commissionne (1200) est du TTC : colonne HT = 1200/1,2 = 1000, colonne TTC = 1200
    expect(txt).toMatch(/1\s?000\s?€/);
    expect(txt).toMatch(/1\s?200\s?€/);
  });

  it('client intracom (TVA 0%) : HT = TTC (pas de division)', () => {
    const { container } = render(
      <ManuelTab
        projets={[
          projet({
            clientTvaIntracom: 'BE0477472701',
            events: [ev({ montant_brut: 1000, montant_commissionne: 500 })],
          }),
        ]}
      />,
    );
    const txt = (container.textContent ?? '').replace(/[\u202f\u00a0]/g, ' ');
    // régime 0 % : colonnes HT et TTC affichent toutes deux 500
    expect((txt.match(/500\s?€/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
