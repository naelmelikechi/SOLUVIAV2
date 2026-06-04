// Set required env BEFORE any import that loads @/lib/env (zod-validated).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@supabase/supabase-js';

/**
 * Tests pour lib/actions/factures/payments.ts (addManualPayment).
 *
 * Couvre les invariants critiques :
 * - Reserve aux superadmins (requireSuperAdmin) : un admin classique se voit
 *   refuser l'acces.
 * - Push Odoo (account.payment.register) AVANT l'insert local. Si Odoo echoue,
 *   rien n'est ecrit cote Soluvia.
 * - L'insert local stocke l'odoo_id retourne pour eviter un doublon au
 *   prochain cron pullPayments (qui upsert sur odoo_id).
 * - Statut facture bascule a 'payee' quand somme des paiements >= montant_ttc.
 * - Refuse si la facture n'a pas d'odoo_id (pas synchronisee).
 * - Refuse sur un avoir ou un statut non-emise/en_retard.
 */

const mocks = vi.hoisted(() => {
  let authState: unknown = {
    ok: true,
    supabase: {
      from: vi.fn(),
    },
    user: { id: '00000000-0000-4000-8000-000000000000' } as User,
    role: 'superadmin',
  };

  const odooMock = {
    ping: vi.fn(),
    pushInvoice: vi.fn(),
    pushCreditNote: vi.fn(),
    pullPayments: vi.fn(),
    pullCancellations: vi.fn(),
    registerPayment: vi.fn(),
  };

  return {
    getAuth: () => authState,
    setAuth: (v: unknown) => {
      authState = v;
    },
    odooMock,
  };
});

vi.mock('@/lib/auth/guards', () => ({
  requireSuperAdmin: vi.fn(async () => mocks.getAuth()),
}));

vi.mock('@/lib/odoo/client', () => ({
  createOdooClient: () => mocks.odooMock,
}));

vi.mock('@/lib/utils/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { addManualPayment } from '@/lib/actions/factures/payments';

interface FactureFixture {
  id: string;
  ref: string | null;
  statut: string;
  montant_ttc: number;
  est_avoir: boolean;
  odoo_id: string | null;
}

/**
 * Build a chainable Supabase mock that returns the given fixture for the
 * single() call on factures, and a list of paiements for the post-insert sum.
 */
function buildSupabase(opts: {
  facture: FactureFixture | null;
  fetchError?: unknown;
  paiementsAfterInsert?: Array<{ montant: number }>;
  insertError?: unknown;
  updateSpy?: ReturnType<typeof vi.fn>;
}) {
  const insertSpy = vi
    .fn()
    .mockResolvedValue({ error: opts.insertError ?? null });
  const updateSpy =
    opts.updateSpy ??
    vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

  const from = vi.fn((table: string) => {
    if (table === 'factures') {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: opts.facture,
                error: opts.fetchError ?? null,
              }),
          }),
        }),
        update: updateSpy,
      };
    }
    if (table === 'paiements') {
      return {
        insert: insertSpy,
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: opts.paiementsAfterInsert ?? [],
              error: null,
            }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return { from, insertSpy, updateSpy };
}

const VALID_FACTURE_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  // Default auth state: superadmin
  mocks.setAuth({
    ok: true,
    supabase: { from: vi.fn() },
    user: { id: '00000000-0000-4000-8000-000000000000' } as User,
    role: 'superadmin',
  });
});

describe('addManualPayment', () => {
  it('refuse si l user n est pas superadmin', async () => {
    mocks.setAuth({
      ok: false,
      error: 'Accès refusé - réservé aux superadmins',
    });
    const result = await addManualPayment({
      factureId: VALID_FACTURE_ID,
      montant: 100,
      dateReception: '2026-05-24',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/superadmin/i);
    expect(mocks.odooMock.registerPayment).not.toHaveBeenCalled();
  });

  it('refuse si la facture n a pas d odoo_id (pas synchronisee)', async () => {
    const supabase = buildSupabase({
      facture: {
        id: VALID_FACTURE_ID,
        ref: 'FAC-TST-0001',
        statut: 'emise',
        montant_ttc: 120,
        est_avoir: false,
        odoo_id: null,
      },
    });
    mocks.setAuth({
      ok: true,
      supabase,
      user: { id: 'user-1' },
      role: 'superadmin',
    });
    const result = await addManualPayment({
      factureId: VALID_FACTURE_ID,
      montant: 120,
      dateReception: '2026-05-24',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/odoo_id/i);
    expect(mocks.odooMock.registerPayment).not.toHaveBeenCalled();
    expect(supabase.insertSpy).not.toHaveBeenCalled();
  });

  it('refuse sur un avoir', async () => {
    const supabase = buildSupabase({
      facture: {
        id: VALID_FACTURE_ID,
        ref: 'FAC-TST-0001',
        statut: 'avoir',
        montant_ttc: 120,
        est_avoir: true,
        odoo_id: '42',
      },
    });
    mocks.setAuth({
      ok: true,
      supabase,
      user: { id: 'user-1' },
      role: 'superadmin',
    });
    const result = await addManualPayment({
      factureId: VALID_FACTURE_ID,
      montant: 120,
      dateReception: '2026-05-24',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/avoir/i);
    expect(mocks.odooMock.registerPayment).not.toHaveBeenCalled();
  });

  it('refuse si statut n est ni emise ni en_retard', async () => {
    const supabase = buildSupabase({
      facture: {
        id: VALID_FACTURE_ID,
        ref: 'FAC-TST-0001',
        statut: 'payee',
        montant_ttc: 120,
        est_avoir: false,
        odoo_id: '42',
      },
    });
    mocks.setAuth({
      ok: true,
      supabase,
      user: { id: 'user-1' },
      role: 'superadmin',
    });
    const result = await addManualPayment({
      factureId: VALID_FACTURE_ID,
      montant: 120,
      dateReception: '2026-05-24',
    });
    expect(result.success).toBe(false);
    expect(mocks.odooMock.registerPayment).not.toHaveBeenCalled();
  });

  it('push Odoo AVANT l insert local : si Odoo echoue, rien n est insere', async () => {
    const supabase = buildSupabase({
      facture: {
        id: VALID_FACTURE_ID,
        ref: 'FAC-TST-0001',
        statut: 'emise',
        montant_ttc: 120,
        est_avoir: false,
        odoo_id: '42',
      },
    });
    mocks.setAuth({
      ok: true,
      supabase,
      user: { id: 'user-1' },
      role: 'superadmin',
    });
    mocks.odooMock.registerPayment.mockRejectedValueOnce(
      new Error('account journal not found for company'),
    );

    const result = await addManualPayment({
      factureId: VALID_FACTURE_ID,
      montant: 120,
      dateReception: '2026-05-24',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Odoo/);
    expect(mocks.odooMock.registerPayment).toHaveBeenCalledWith({
      invoice_odoo_id: '42',
      amount: 120,
      payment_date: '2026-05-24',
      communication: 'FAC-TST-0001',
    });
    expect(supabase.insertSpy).not.toHaveBeenCalled();
  });

  it('flow nominal : push Odoo OK puis insert local avec odoo_id', async () => {
    const supabase = buildSupabase({
      facture: {
        id: VALID_FACTURE_ID,
        ref: 'FAC-TST-0001',
        statut: 'en_retard',
        montant_ttc: 120,
        est_avoir: false,
        odoo_id: '42',
      },
      paiementsAfterInsert: [{ montant: 120 }],
    });
    mocks.setAuth({
      ok: true,
      supabase,
      user: { id: 'user-1' },
      role: 'superadmin',
    });
    mocks.odooMock.registerPayment.mockResolvedValueOnce({ odoo_id: '99-42' });

    const result = await addManualPayment({
      factureId: VALID_FACTURE_ID,
      montant: 120,
      dateReception: '2026-05-24',
    });

    expect(result.success).toBe(true);
    expect(mocks.odooMock.registerPayment).toHaveBeenCalledTimes(1);
    expect(supabase.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        facture_id: VALID_FACTURE_ID,
        montant: 120,
        date_reception: '2026-05-24',
        saisie_manuelle: true,
        odoo_id: '99-42',
      }),
    );
    // Statut payee : total (120) >= montant_ttc (120)
    expect(supabase.updateSpy).toHaveBeenCalled();
  });

  it('paiement partiel : ne bascule pas a payee si total < montant_ttc', async () => {
    const supabase = buildSupabase({
      facture: {
        id: VALID_FACTURE_ID,
        ref: 'FAC-TST-0001',
        statut: 'emise',
        montant_ttc: 200,
        est_avoir: false,
        odoo_id: '42',
      },
      paiementsAfterInsert: [{ montant: 80 }],
    });
    mocks.setAuth({
      ok: true,
      supabase,
      user: { id: 'user-1' },
      role: 'superadmin',
    });
    mocks.odooMock.registerPayment.mockResolvedValueOnce({ odoo_id: '101-42' });

    const result = await addManualPayment({
      factureId: VALID_FACTURE_ID,
      montant: 80,
      dateReception: '2026-05-24',
    });

    expect(result.success).toBe(true);
    expect(supabase.updateSpy).not.toHaveBeenCalled();
  });
});
