process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect } from 'vitest';
import { settlementBadge } from '@/components/facturation/settlement-badge';
import type { BillableEvent } from '@/lib/queries/billable-events';

function ev(over: Partial<BillableEvent>): BillableEvent {
  return {
    type: 'engagement',
    source_id: 's',
    contrat_id: 'c',
    contrat_ref: null,
    contract_number: null,
    internal_number: null,
    apprenant_nom: '',
    apprenant_prenom: '',
    formation_titre: null,
    contract_state: 'ENGAGE',
    step_number: null,
    step_opening_date: null,
    step_paid_at: null,
    invoice_state: null,
    external_number: null,
    invoice_number: null,
    opco_settled_amount: null,
    net_invoiced_amount: null,
    opco_code: null,
    opco_nom: null,
    montant_brut: 0,
    montant_commissionne: 0,
    status: 'available',
    ...over,
  };
}

describe('settlementBadge', () => {
  it('REGLE -> "Payé" vert', () => {
    expect(settlementBadge(ev({ invoice_state: 'REGLE' }))).toMatchObject({
      label: 'Payé',
      color: 'green',
      note: null,
    });
  });

  it('available + TRANSMIS avec pedago regle (opco_settled < net_invoiced) -> "Pédago réglé" vert + note equipement', () => {
    // C'est LE cas qui pretait a confusion : facturable (pedago encaisse) mais
    // l'ancien badge affichait "Transmis" orange comme si rien n'etait payable.
    const b = settlementBadge(
      ev({
        status: 'available',
        invoice_state: 'TRANSMIS',
        opco_settled_amount: 2505.6,
        net_invoiced_amount: 3005.6,
      }),
    );
    expect(b.label).toBe('Pédago réglé');
    expect(b.color).toBe('green');
    expect(b.note).toMatch(/équipement en attente/);
  });

  it('available + TRANSMIS sans montants -> "Pédago réglé" sans note', () => {
    const b = settlementBadge(
      ev({ status: 'available', invoice_state: 'TRANSMIS' }),
    );
    expect(b.label).toBe('Pédago réglé');
    expect(b.note).toBeNull();
  });

  it('TRANSMIS non facturable (status != available) -> "Transmis" orange', () => {
    expect(
      settlementBadge(ev({ status: 'billed', invoice_state: 'TRANSMIS' })),
    ).toMatchObject({ label: 'Transmis', color: 'orange', note: null });
  });
});
