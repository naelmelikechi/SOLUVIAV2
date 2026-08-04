process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi } from 'vitest';

/**
 * Tests pour stepEncaisseOpco (lib/queries/projets.ts).
 *
 * Semantique "pedago regle" alignee sur lib/queries/billable-events/derive.ts,
 * PART PEDAGOGIE uniquement (le premier equipement est exclu de la ligne OPCO
 * de la fiche Finance pour rester comparable a la Production = NPEC pedago) :
 * - invoice_state = REGLE -> including_pedagogie_amount
 * - reglement partiel -> min(opco_settled_amount, part pedago)
 * - step non resynchronise (opco_settled_amount NULL) -> 0
 * - including_pedagogie_amount NULL -> fallback total_amount
 */

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { stepEncaisseOpco } from '@/lib/queries/projets';

describe('stepEncaisseOpco', () => {
  it('compte la part pedago quand le step est REGLE (equipement exclu)', () => {
    expect(
      stepEncaisseOpco({
        total_amount: 1000,
        including_pedagogie_amount: 900,
        invoice_state: 'REGLE',
        opco_settled_amount: null,
      }),
    ).toBe(900);
  });

  it('borne a la part pedago quand opco_settled_amount couvre tout (state TRANSMIS)', () => {
    expect(
      stepEncaisseOpco({
        total_amount: 1000,
        including_pedagogie_amount: 900,
        invoice_state: 'TRANSMIS',
        opco_settled_amount: 1200,
      }),
    ).toBe(900);
  });

  it('compte le reglement partiel', () => {
    expect(
      stepEncaisseOpco({
        total_amount: 1000,
        including_pedagogie_amount: 900,
        invoice_state: 'TRANSMIS',
        opco_settled_amount: 400,
      }),
    ).toBe(400);
  });

  it('retombe a 0 si opco_settled_amount NULL et non REGLE', () => {
    expect(
      stepEncaisseOpco({
        total_amount: 1000,
        including_pedagogie_amount: 900,
        invoice_state: 'TRANSMIS',
        opco_settled_amount: null,
      }),
    ).toBe(0);
    expect(
      stepEncaisseOpco({
        total_amount: 1000,
        including_pedagogie_amount: 900,
        invoice_state: 'NOTSENT',
        opco_settled_amount: null,
      }),
    ).toBe(0);
  });

  it('fallback sur total_amount quand la part pedago est NULL', () => {
    expect(
      stepEncaisseOpco({
        total_amount: 1000,
        including_pedagogie_amount: null,
        invoice_state: 'REGLE',
        opco_settled_amount: null,
      }),
    ).toBe(1000);
  });

  it('tolere total_amount NULL', () => {
    expect(
      stepEncaisseOpco({
        total_amount: null,
        including_pedagogie_amount: null,
        invoice_state: 'REGLE',
        opco_settled_amount: null,
      }),
    ).toBe(0);
  });
});
