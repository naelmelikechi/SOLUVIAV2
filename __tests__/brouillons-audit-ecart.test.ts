// Set required env BEFORE any import that loads @/lib/env (zod-validated).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests pour l'audit log ecart PEDAGOGIE dans createFactureFromEvents
 * (lib/actions/factures/brouillons.ts).
 *
 * Couverture :
 * - Ecart > 0.01 EUR : logger.info appele avec le payload attendu
 * - Ecart = 0 (montants identiques) : logger.info NON appele
 *
 * Les tests mockent getBillableEvents pour injecter des events avec
 * _stepInvoiceIds, puis mockent supabase (via requireAuth) pour retourner
 * les donnees eduvia_invoice_steps et eduvia_invoice_lines correspondantes.
 */

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/utils/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/guards', () => ({
  requireAuth: vi.fn(),
  checkAuth: vi.fn(),
}));

vi.mock('@/lib/queries/billable-events', () => ({
  getBillableEvents: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// Mock societes-emettrices helper (not yet seeded in test env).
vi.mock('@/lib/queries/societes-emettrices', () => ({
  getDefaultSocieteEmettriceId: vi.fn().mockResolvedValue('soc-default-id'),
}));

import { requireAuth, checkAuth } from '@/lib/auth/guards';
import { getBillableEvents } from '@/lib/queries/billable-events';
import { logger } from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// IDs fixes en format UUID v4 valide (requis par le schema Zod :
// [1-8] en position 3 et [89abAB] en position 4)
// ---------------------------------------------------------------------------
const PROJET_ID = 'a1b2c3d4-1234-4abc-89ef-000000000001';
const CONTRAT_ID = 'a1b2c3d4-1234-4abc-89ef-000000000002';
const CLIENT_ID = 'a1b2c3d4-1234-4abc-89ef-000000000003';
const FACTURE_ID = 'a1b2c3d4-1234-4abc-89ef-000000000004';

const mockUser = {
  id: 'a1b2c3d4-1234-4abc-89ef-000000000099',
  email: 'admin@test.com',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Un event engagement minimal (sans _stepInvoiceIds : retire de l'interface) */
function makeEvent(
  overrides: Partial<{
    source_id: string;
    contrat_id: string;
    montant_brut: number;
    montant_commissionne: number;
  }> = {},
) {
  return {
    type: 'engagement' as const,
    source_id: CONTRAT_ID,
    contrat_id: CONTRAT_ID,
    contrat_ref: 'CTR-00100',
    contract_number: 'DECA-AUDIT-001',
    internal_number: 'INT-001',
    apprenant_nom: 'Dupont',
    apprenant_prenom: 'Jean',
    formation_titre: 'Vente',
    contract_state: 'ENGAGE',
    step_number: null,
    step_opening_date: null,
    step_paid_at: null,
    opco_code: 'AKTO',
    opco_nom: 'AKTO',
    montant_brut: 2504,
    montant_commissionne: 1252,
    status: 'available' as const,
    ...overrides,
  };
}

/**
 * Construit un mock supabase client minimal pour createFactureFromEvents.
 *
 * Sequence des appels `.from(table)` dans la fonction apres la phase
 * getBillableEvents (qui est mockee) :
 *   1. projets               -> SELECT id, client_id, taux_commission (.single)
 *   2. eduvia_invoice_steps  -> audit log SELECT (.then via Promise.all)
 *   3. eduvia_invoice_lines  -> audit log SELECT (.then via Promise.all)
 *   4. factures              -> INSERT brouillon (.single)
 *   5. facture_lignes        -> INSERT lignes (.then)
 *
 * On utilise un curseur par table pour gerer les appels multiples.
 */
function buildSupabase(opts: {
  steps: Array<{
    eduvia_invoice_id: number;
    including_pedagogie_amount: number;
    contrat_id: string;
  }>;
  lines: Array<{
    eduvia_invoice_id: number;
    amount: number;
  }>;
}) {
  type TableResult = { data: unknown; error: unknown };
  const queues: Record<string, TableResult[]> = {
    projets: [
      {
        data: {
          id: PROJET_ID,
          client_id: CLIENT_ID,
          taux_commission: 50,
        },
        error: null,
      },
    ],
    eduvia_invoice_steps: [{ data: opts.steps, error: null }],
    eduvia_invoice_lines: [{ data: opts.lines, error: null }],
    factures: [{ data: { id: FACTURE_ID }, error: null }],
    facture_lignes: [{ data: null, error: null }],
  };
  const cursor: Record<string, number> = {};

  function next(table: string): TableResult {
    const q = queues[table];
    if (!q || q.length === 0) return { data: [], error: null };
    const idx = cursor[table] ?? 0;
    cursor[table] = idx + 1;
    return q[idx] ?? { data: [], error: null };
  }

  function makeChain(table: string) {
    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: () => chain,
      eq: () => chain,
      in: () => chain,
      not: () => chain,
      single: () => {
        const r = next(table);
        return Promise.resolve(r);
      },
      then: (resolve: (v: unknown) => unknown) => {
        const r = next(table);
        return Promise.resolve(r).then(resolve);
      },
    };
    return chain;
  }

  return {
    from: (table: string) => makeChain(table),
  };
}

// requireAuth fournit le client supabase utilise dans createFactureFromEvents.
function mockRequireUser(supabaseMock: ReturnType<typeof buildSupabase>) {
  const authResult = {
    ok: true,
    supabase: supabaseMock as never,
    user: mockUser,
  } as never;
  vi.mocked(requireAuth).mockResolvedValue(authResult);
  vi.mocked(checkAuth).mockResolvedValue(authResult);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createFactureFromEvents - audit log ecart PEDAGOGIE', () => {
  it('log info quand |ecart| > 0.01 EUR (arrondi Eduvia connu)', async () => {
    // step.including_pedagogie_amount = 2504.64
    // SUM(lines PEDAGOGIE) = 2504.00
    // ecart attendu = 0.64 -> doit appeler logger.info

    const event = makeEvent();

    vi.mocked(getBillableEvents).mockResolvedValue({
      projetId: PROJET_ID,
      projetRef: '0007-HEO-APP',
      clientRaisonSociale: 'Heol Formation',
      tauxCommission: 50,
      events: [event],
      // auditInvoiceIdsBySource: event.source_id (= CONTRAT_ID) -> [100]
      auditInvoiceIdsBySource: new Map([[CONTRAT_ID, [100]]]),
    });

    const supabaseMock = buildSupabase({
      steps: [
        {
          eduvia_invoice_id: 100,
          including_pedagogie_amount: 2504.64,
          contrat_id: CONTRAT_ID,
        },
      ],
      lines: [{ eduvia_invoice_id: 100, amount: 2504.0 }],
    });

    mockRequireUser(supabaseMock);

    const { createFactureFromEvents } =
      await import('@/lib/actions/factures/brouillons');
    await createFactureFromEvents({
      projetId: PROJET_ID,
      events: [{ type: 'engagement', source_id: CONTRAT_ID }],
    });

    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      'actions.factures',
      'ecart pedago lines vs step',
      expect.objectContaining({
        invoice_id: 100,
        contrat_id: CONTRAT_ID,
        step_pedago: 2504.64,
        lines_pedago: 2504.0,
        ecart: 0.64,
      }),
    );
  });

  it('aucun log quand ecart = 0 (montants identiques)', async () => {
    // step.including_pedagogie_amount = 2666.56
    // SUM(lines PEDAGOGIE) = 2666.56
    // ecart = 0 -> logger.info ne doit pas etre appele pour l'audit pedago

    const event = makeEvent({
      montant_brut: 2666.56,
      montant_commissionne: 1333.28,
    });

    vi.mocked(getBillableEvents).mockResolvedValue({
      projetId: PROJET_ID,
      projetRef: '0007-HEO-APP',
      clientRaisonSociale: 'Heol Formation',
      tauxCommission: 50,
      events: [event],
      // auditInvoiceIdsBySource: event.source_id (= CONTRAT_ID) -> [200]
      auditInvoiceIdsBySource: new Map([[CONTRAT_ID, [200]]]),
    });

    const supabaseMock = buildSupabase({
      steps: [
        {
          eduvia_invoice_id: 200,
          including_pedagogie_amount: 2666.56,
          contrat_id: CONTRAT_ID,
        },
      ],
      lines: [{ eduvia_invoice_id: 200, amount: 2666.56 }],
    });

    mockRequireUser(supabaseMock);

    const { createFactureFromEvents } =
      await import('@/lib/actions/factures/brouillons');
    await createFactureFromEvents({
      projetId: PROJET_ID,
      events: [{ type: 'engagement', source_id: CONTRAT_ID }],
    });

    // Filtrer les appels a logger.info avec le message d'audit pedago
    const auditCalls = vi
      .mocked(logger.info)
      .mock.calls.filter((args) => args[1] === 'ecart pedago lines vs step');
    expect(auditCalls).toHaveLength(0);
  });
});
