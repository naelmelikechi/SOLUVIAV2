process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests pour lib/queries/billable-events.ts (HEOL / billable events).
 *
 * Couverture clef demandee dans project_todos_open (2026-05-11) :
 * - Base engagement = somme step_number=1 avec invoice_state non null
 *   (et pas le NPEC contractuel)
 * - ENGAGE sans step 1 emis -> brut=0, event 'engagement' SKIP
 * - Multiple step 1 (ancien + nouveau apres modif contrat) -> somme
 * - Avoir compensateur libere le contrat (live + avoir -> available, pas billed)
 * - Regle d exclusion engagement <-> opco_step par contrat (locked)
 * - Commission = round(brut * taux / 100, 2)
 */

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Mock builder : pile de resultats par table dans l ordre des `from(table)`.
// Le query chain accepte select/eq/in/or/not/order/maybeSingle/then.
// ---------------------------------------------------------------------------

interface TableResult {
  data?: unknown;
  error?: unknown;
}

function buildSupabase(
  tableResults: Record<string, TableResult | TableResult[]>,
) {
  // Defaults pour que les tests agnostiques d'OPCO resolvent un OPCO via IDCC
  // (sinon tout contrat serait locked missing_idcc). Les tests OPCO surchargent.
  const resolved: Record<string, TableResult | TableResult[]> = {
    opcos: { data: [{ code: 'AKTO', nom: 'AKTO', idcc_codes: ['1979'] }] },
    // eduvia_id 1 = contrats du builder contrat() ; -1 = contrats inline sans
    // eduvia_company_id explicite (production fait `?? -1`). Tous -> idcc 1979.
    eduvia_companies: {
      data: [
        { eduvia_id: 1, idcc_code: '1979' },
        { eduvia_id: -1, idcc_code: '1979' },
      ],
    },
    ...tableResults,
  };
  const cursor: Record<string, number> = {};

  function nextResult(table: string): TableResult {
    const r = resolved[table];
    if (!r) return { data: [], error: null };
    if (Array.isArray(r)) {
      const idx = cursor[table] ?? 0;
      cursor[table] = idx + 1;
      return r[idx] ?? { data: [], error: null };
    }
    return r;
  }

  function makeChain(table: string) {
    const resolve = () => {
      const r = nextResult(table);
      return Promise.resolve({
        data: r.data ?? null,
        error: r.error ?? null,
      });
    };
    const chain: Record<string, unknown> = {
      eq: () => chain,
      in: () => chain,
      or: () => chain,
      not: () => chain,
      is: () => chain,
      order: () => chain,
      maybeSingle: () => resolve(),
      single: () => resolve(),
      then: (onFulfilled: (v: unknown) => unknown) =>
        resolve().then(onFulfilled),
    };
    return chain;
  }

  return {
    client: {
      from(table: string) {
        return {
          select() {
            return makeChain(table);
          },
        };
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// Reusable projet/contrat builders -----------------------------------------

const projet = {
  id: 'pjt-1',
  ref: '0007-HEO-APP',
  taux_commission: 50,
  client: { id: 'cli-1', raison_sociale: 'Heol Formation' },
};

function contrat(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'ctr-1',
    ref: 'CTR-00001',
    contract_number: 'DECA-001',
    internal_number: 'INT-001',
    apprenant_nom: 'Dupont',
    apprenant_prenom: 'Jean',
    formation_titre: 'Vente',
    contract_state: 'ENGAGE',
    npec_amount: 8000,
    eduvia_company_id: 1,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Base engagement (step 1 emis seulement)
// ---------------------------------------------------------------------------

describe('getBillableEvents - base engagement', () => {
  it('skip event "engagement" si contrat ENGAGE sans step 1 emis (brut=0)', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat()] },
      eduvia_invoice_lines: { data: [] }, // aucune ligne -> pas de base
      eduvia_invoice_steps: { data: [] }, // aucun step emis
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const result = await getBillableEvents('pjt-1');

    expect(result).not.toBeNull();
    expect(result!.events).toEqual([]);
  });

  it('base engagement = step 1 PAYE (REGLE) uniquement, exclut TRANSMIS et NPEC', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat({ npec_amount: 8000 })] },
      // 2 lignes PEDAGOGIE sur des step 1 differents (cas re-emission apres modif contrat)
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 101,
            contrat_id: 'ctr-1',
            amount: 1000,
            line_type: 'PEDAGOGIE',
          },
          {
            eduvia_invoice_id: 102,
            contrat_id: 'ctr-1',
            amount: 500,
            line_type: 'PEDAGOGIE',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-uuid-101',
            contrat_id: 'ctr-1',
            step_number: 1,
            eduvia_invoice_id: 101,
            including_pedagogie_amount: 1000,
            opening_date: '2026-01-01',
            paid_at: null,
            invoice_state: 'TRANSMIS',
          },
          {
            id: 'step-uuid-102',
            contrat_id: 'ctr-1',
            step_number: 1,
            eduvia_invoice_id: 102,
            including_pedagogie_amount: 500,
            opening_date: '2026-01-15',
            paid_at: '2026-02-01',
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const result = await getBillableEvents('pjt-1');

    expect(result!.events).toHaveLength(1);
    const ev = result!.events[0]!;
    expect(ev.type).toBe('engagement');
    // Seul le step 1 REGLE (paye, invoice 102 = 500) entre dans la base.
    // Le step 1 TRANSMIS (invoice 101 = 1000) est emis mais pas encaisse -> exclu.
    expect(ev.montant_brut).toBe(500);
    // commission 50% -> 250
    expect(ev.montant_commissionne).toBe(250);
    expect(ev.status).toBe('available');
  });

  it('engagement step 1 seulement TRANSMIS (emis non paye) -> aucun event', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat({ npec_amount: 8000 })] },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 111,
            contrat_id: 'ctr-1',
            amount: 2000,
            line_type: 'PEDAGOGIE',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-uuid-111',
            contrat_id: 'ctr-1',
            step_number: 1,
            eduvia_invoice_id: 111,
            including_pedagogie_amount: 2000,
            opening_date: '2026-01-01',
            paid_at: null,
            invoice_state: 'TRANSMIS',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const result = await getBillableEvents('pjt-1');
    // TRANSMIS = bordereau emis mais OPCO pas encore paye -> rien a facturer.
    expect(result!.events).toEqual([]);
    // ...mais la PEDAGOGIE emise est captee pour le bucket "en attente".
    expect(result!.contrats[0]!.pedago_emis_non_paye).toBe(2000);
  });

  it('commission arrondie au centime', async () => {
    const mock = buildSupabase({
      projets: { data: { ...projet, taux_commission: 33 } },
      contrats: { data: [contrat()] },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 103,
            contrat_id: 'ctr-1',
            amount: 123.45,
            line_type: 'PEDAGOGIE',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-uuid-103',
            contrat_id: 'ctr-1',
            step_number: 1,
            eduvia_invoice_id: 103,
            including_pedagogie_amount: 123.45,
            opening_date: '2026-01-01',
            paid_at: null,
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const result = await getBillableEvents('pjt-1');

    // 123.45 * 33 / 100 = 40.7385 -> 40.74
    expect(result!.events[0]!.montant_commissionne).toBe(40.74);
  });
});

// ---------------------------------------------------------------------------
// Avoir compensateur libere le contrat
// ---------------------------------------------------------------------------

describe('getBillableEvents - avoir compensateur', () => {
  it('event est "available" si live + avoir sur meme event_source_id', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat()] },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 201,
            contrat_id: 'ctr-1',
            amount: 2000,
            line_type: 'PEDAGOGIE',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-uuid-201',
            contrat_id: 'ctr-1',
            step_number: 1,
            eduvia_invoice_id: 201,
            including_pedagogie_amount: 2000,
            opening_date: '2026-01-01',
            paid_at: null,
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: {
        data: [
          // Live engagement
          {
            event_type: 'engagement',
            event_source_id: 'ctr-1',
            contrat_id: 'ctr-1',
            est_avoir: false,
            facture: { id: 'fac-A', ref: 'FAC-HEO-0001', statut: 'emise' },
          },
          // Avoir compensateur
          {
            event_type: 'engagement',
            event_source_id: 'ctr-1',
            contrat_id: 'ctr-1',
            est_avoir: true,
            facture: { id: 'fac-B', ref: 'FAC-HEO-0002', statut: 'emise' },
          },
        ],
      },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const result = await getBillableEvents('pjt-1');

    const ev = result!.events.find((e) => e.type === 'engagement')!;
    expect(ev.status).toBe('available');
    expect(ev.billed_on).toBeUndefined();
    expect(ev.locked_by).toBeUndefined();
  });

  it('event est "billed" si live sans avoir compensateur', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat()] },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 202,
            contrat_id: 'ctr-1',
            amount: 2000,
            line_type: 'PEDAGOGIE',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-uuid-202',
            contrat_id: 'ctr-1',
            step_number: 1,
            eduvia_invoice_id: 202,
            including_pedagogie_amount: 2000,
            opening_date: '2026-01-01',
            paid_at: null,
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: {
        data: [
          {
            event_type: 'engagement',
            event_source_id: 'ctr-1',
            contrat_id: 'ctr-1',
            est_avoir: false,
            facture: { id: 'fac-A', ref: 'FAC-HEO-0001', statut: 'emise' },
          },
        ],
      },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const result = await getBillableEvents('pjt-1');

    const ev = result!.events.find((e) => e.type === 'engagement')!;
    expect(ev.status).toBe('billed');
    expect(ev.billed_on?.facture_ref).toBe('FAC-HEO-0001');
  });
});

// ---------------------------------------------------------------------------
// Regle d exclusion engagement <-> opco_step
// ---------------------------------------------------------------------------

describe('getBillableEvents - exclusion engagement / opco_step', () => {
  it('opco_step est "locked" si engagement deja facture sur le contrat', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat()] },
      // Ligne PEDAGOGIE pour step 2 (opco_step) + ligne pour step 1 (engagement)
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 301,
            contrat_id: 'ctr-1',
            amount: 1000,
            line_type: 'PEDAGOGIE',
          },
          {
            eduvia_invoice_id: 302,
            contrat_id: 'ctr-1',
            amount: 2000,
            line_type: 'PEDAGOGIE',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-1',
            contrat_id: 'ctr-1',
            step_number: 2,
            eduvia_invoice_id: 301,
            including_pedagogie_amount: 1000,
            opening_date: '2026-01-15',
            paid_at: '2026-02-01',
            invoice_state: 'REGLE',
          },
          {
            id: 'step-uuid-302',
            contrat_id: 'ctr-1',
            step_number: 1,
            eduvia_invoice_id: 302,
            including_pedagogie_amount: 2000,
            opening_date: '2026-01-01',
            paid_at: null,
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: {
        data: [
          // engagement deja facture
          {
            event_type: 'engagement',
            event_source_id: 'ctr-1',
            contrat_id: 'ctr-1',
            est_avoir: false,
            facture: { id: 'fac-A', ref: 'FAC-HEO-0001', statut: 'emise' },
          },
        ],
      },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const result = await getBillableEvents('pjt-1');

    const opco = result!.events.find((e) => e.type === 'opco_step')!;
    expect(opco.status).toBe('locked');
    expect(opco.locked_by?.facture_ref).toBe('FAC-HEO-0001');
  });

  it('engagement est "locked" si opco_step deja facture sur le contrat', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat()] },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 401,
            contrat_id: 'ctr-1',
            amount: 1000,
            line_type: 'PEDAGOGIE',
          },
          {
            eduvia_invoice_id: 402,
            contrat_id: 'ctr-1',
            amount: 2000,
            line_type: 'PEDAGOGIE',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-1',
            contrat_id: 'ctr-1',
            step_number: 2,
            eduvia_invoice_id: 401,
            including_pedagogie_amount: 1000,
            opening_date: '2026-01-15',
            paid_at: '2026-02-01',
            invoice_state: 'REGLE',
          },
          {
            id: 'step-uuid-402',
            contrat_id: 'ctr-1',
            step_number: 1,
            eduvia_invoice_id: 402,
            including_pedagogie_amount: 2000,
            opening_date: '2026-01-01',
            paid_at: null,
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: {
        data: [
          {
            event_type: 'opco_step',
            event_source_id: 'step-1',
            contrat_id: 'ctr-1',
            est_avoir: false,
            facture: { id: 'fac-Z', ref: 'FAC-HEO-0042', statut: 'emise' },
          },
        ],
      },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const result = await getBillableEvents('pjt-1');

    const engagement = result!.events.find((e) => e.type === 'engagement')!;
    expect(engagement.status).toBe('locked');
    expect(engagement.locked_by?.facture_ref).toBe('FAC-HEO-0042');
  });
});

// ---------------------------------------------------------------------------
// Cas limites
// ---------------------------------------------------------------------------

describe('getBillableEvents - cas limites', () => {
  it('retourne null si projet inexistant', async () => {
    const mock = buildSupabase({
      projets: { data: null, error: { message: 'not found' } },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const result = await getBillableEvents('pjt-X');
    expect(result).toBeNull();
  });

  it('retourne projet vide si aucun contrat', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const result = await getBillableEvents('pjt-1');
    expect(result).toMatchObject({
      projetId: 'pjt-1',
      projetRef: '0007-HEO-APP',
      clientRaisonSociale: 'Heol Formation',
      tauxCommission: 50,
      events: [],
    });
    expect(result?.auditInvoiceIdsBySource).toBeInstanceOf(Map);
    expect(result?.auditInvoiceIdsBySource.size).toBe(0);
  });

  it('contrat NON-ENGAGE sans opco_step paye -> aucun event', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat({ contract_state: 'EN_ATTENTE' })] },
      eduvia_invoice_lines: { data: [] },
      eduvia_invoice_steps: { data: [] },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const result = await getBillableEvents('pjt-1');
    expect(result!.events).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// IDCC manquant (OPCO non resoluble)
// ---------------------------------------------------------------------------

describe('getBillableEvents - IDCC manquant', () => {
  it('event engagement "locked" lock_reason "missing_idcc" si idcc_code employeur null', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat()] },
      eduvia_companies: { data: [{ eduvia_id: 1, idcc_code: null }] },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 501,
            contrat_id: 'ctr-1',
            amount: 2000,
            line_type: 'PEDAGOGIE',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-uuid-501',
            contrat_id: 'ctr-1',
            step_number: 1,
            eduvia_invoice_id: 501,
            including_pedagogie_amount: 2000,
            opening_date: '2026-01-01',
            paid_at: null,
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const result = await getBillableEvents('pjt-1');

    expect(result!.events).toHaveLength(1);
    const ev = result!.events[0]!;
    expect(ev.type).toBe('engagement');
    expect(ev.status).toBe('locked');
    expect(ev.lock_reason).toBe('missing_idcc');
    expect(ev.locked_by).toBeUndefined();
  });

  it('event opco_step "locked" lock_reason "missing_idcc" si company employeur inconnue', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: {
        data: [contrat({ contract_state: 'REGLE' })],
      },
      eduvia_companies: { data: [] },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 601,
            contrat_id: 'ctr-1',
            amount: 1500,
            line_type: 'PEDAGOGIE',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-1',
            contrat_id: 'ctr-1',
            step_number: 2,
            eduvia_invoice_id: 601,
            including_pedagogie_amount: 1500,
            opening_date: '2026-01-15',
            paid_at: '2026-02-01',
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const result = await getBillableEvents('pjt-1');

    expect(result!.events).toHaveLength(1);
    const ev = result!.events[0]!;
    expect(ev.type).toBe('opco_step');
    expect(ev.status).toBe('locked');
    expect(ev.lock_reason).toBe('missing_idcc');
    expect(ev.locked_by).toBeUndefined();
  });

  it('event reste "available" si idcc_code resolu vers un OPCO actif', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat()] },
      eduvia_companies: { data: [{ eduvia_id: 1, idcc_code: '1979' }] },
      opcos: { data: [{ code: 'AKTO', nom: 'AKTO', idcc_codes: ['1979'] }] },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 701,
            contrat_id: 'ctr-1',
            amount: 3000,
            line_type: 'PEDAGOGIE',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-uuid-701',
            contrat_id: 'ctr-1',
            step_number: 1,
            eduvia_invoice_id: 701,
            including_pedagogie_amount: 3000,
            opening_date: '2026-01-01',
            paid_at: null,
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const result = await getBillableEvents('pjt-1');

    expect(result!.events).toHaveLength(1);
    const ev = result!.events[0]!;
    expect(ev.status).toBe('available');
    expect(ev.opco_code).toBe('AKTO');
    expect(ev.lock_reason).toBeUndefined();
  });

  it('missing_idcc prevaut sur opposite_billed (verrou prioritaire)', async () => {
    // Employeur sans IDCC ET engagement deja facture : l opco_step serait
    // lockedByEngagement, mais missing_idcc arrive en premier dans le ternaire.
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat()] },
      eduvia_companies: { data: [{ eduvia_id: 1, idcc_code: null }] },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 801,
            contrat_id: 'ctr-1',
            amount: 1000,
            line_type: 'PEDAGOGIE',
          },
          {
            eduvia_invoice_id: 802,
            contrat_id: 'ctr-1',
            amount: 2000,
            line_type: 'PEDAGOGIE',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-1',
            contrat_id: 'ctr-1',
            step_number: 2,
            eduvia_invoice_id: 801,
            including_pedagogie_amount: 1000,
            opening_date: '2026-01-15',
            paid_at: '2026-02-01',
            invoice_state: 'REGLE',
          },
          {
            id: 'step-uuid-802',
            contrat_id: 'ctr-1',
            step_number: 1,
            eduvia_invoice_id: 802,
            including_pedagogie_amount: 2000,
            opening_date: '2026-01-01',
            paid_at: null,
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: {
        data: [
          {
            event_type: 'engagement',
            event_source_id: 'ctr-1',
            contrat_id: 'ctr-1',
            est_avoir: false,
            facture: { id: 'fac-A', ref: 'FAC-HEO-0001', statut: 'emise' },
          },
        ],
      },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const result = await getBillableEvents('pjt-1');

    const opco = result!.events.find((e) => e.type === 'opco_step')!;
    expect(opco.status).toBe('locked');
    expect(opco.lock_reason).toBe('missing_idcc');
    expect(opco.locked_by).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Calcul sur lignes PEDAGOGIE (Task 2.3)
// ---------------------------------------------------------------------------

describe('getBillableEvents - calcul sur lignes PEDAGOGIE', () => {
  it('1 ligne PEDAGOGIE sur step 1 emis -> engagement a amount (40% commission)', async () => {
    const { client } = buildSupabase({
      projets: {
        data: {
          id: 'proj-1',
          ref: 'TST-001',
          taux_commission: 40,
          client: { id: 'cli-1', raison_sociale: 'Test' },
        },
      },
      contrats: {
        data: [
          {
            id: 'ctr-1',
            ref: 'CTR-T1',
            contract_number: 'DECA001',
            internal_number: '1',
            apprenant_nom: 'Test',
            apprenant_prenom: 'User',
            formation_titre: 'F',
            contract_state: 'ENGAGE',
            npec_amount: 5000,
          },
        ],
      },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 100,
            contrat_id: 'ctr-1',
            amount: 2500,
            line_type: 'PEDAGOGIE',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-uuid-100',
            contrat_id: 'ctr-1',
            step_number: 1,
            eduvia_invoice_id: 100,
            including_pedagogie_amount: 2500,
            opening_date: '2026-01-01',
            paid_at: null,
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const r = await getBillableEvents('proj-1');

    expect(r?.events).toHaveLength(1);
    expect(r?.events[0]).toMatchObject({
      type: 'engagement',
      montant_brut: 2500,
      montant_commissionne: 1000,
      status: 'available',
    });
  });

  it('PEDAGOGIE + PREMIEREQUIPEMENT dans la meme invoice -> base = PEDAGOGIE seul', async () => {
    const { client } = buildSupabase({
      projets: {
        data: {
          id: 'proj-1',
          ref: 'TST',
          taux_commission: 40,
          client: { id: 'cli', raison_sociale: 'Test' },
        },
      },
      contrats: {
        data: [
          {
            id: 'ctr-2',
            ref: 'CTR-T2',
            contract_number: 'DECA002',
            internal_number: '2',
            apprenant_nom: 'Test',
            apprenant_prenom: 'User',
            formation_titre: 'F',
            contract_state: 'ENGAGE',
            npec_amount: 5000,
          },
        ],
      },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 200,
            contrat_id: 'ctr-2',
            amount: 2500,
            line_type: 'PEDAGOGIE',
          },
          {
            eduvia_invoice_id: 200,
            contrat_id: 'ctr-2',
            amount: 500,
            line_type: 'PREMIEREQUIPEMENT',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-200',
            contrat_id: 'ctr-2',
            step_number: 1,
            eduvia_invoice_id: 200,
            including_pedagogie_amount: 2500,
            opening_date: '2026-01-01',
            paid_at: null,
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const r = await getBillableEvents('proj-1');

    expect(r?.events).toHaveLength(1);
    expect(r?.events[0]?.montant_brut).toBe(2500);
    expect(r?.events[0]?.montant_commissionne).toBe(1000);
  });

  it('PREMIEREQUIPEMENT seul (sans PEDAGOGIE) -> pas d event engagement', async () => {
    const { client } = buildSupabase({
      projets: {
        data: {
          id: 'proj-1',
          ref: 'TST',
          taux_commission: 40,
          client: { id: 'cli', raison_sociale: 'Test' },
        },
      },
      contrats: {
        data: [
          {
            id: 'ctr-3',
            ref: 'CTR-T3',
            contract_number: 'DECA003',
            internal_number: '3',
            apprenant_nom: 'Test',
            apprenant_prenom: 'U',
            formation_titre: 'F',
            contract_state: 'ENGAGE',
            npec_amount: 5000,
          },
        ],
      },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 300,
            contrat_id: 'ctr-3',
            amount: 500,
            line_type: 'PREMIEREQUIPEMENT',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-300',
            contrat_id: 'ctr-3',
            step_number: 1,
            eduvia_invoice_id: 300,
            including_pedagogie_amount: 0,
            opening_date: '2026-01-01',
            paid_at: null,
            invoice_state: 'TRANSMIS',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const r = await getBillableEvents('proj-1');
    expect(r?.events).toHaveLength(0);
  });

  it('line_type inconnu sur le contrat -> tous ses events sont locked unknown_line_type', async () => {
    const { client } = buildSupabase({
      projets: {
        data: {
          id: 'proj-1',
          ref: 'TST',
          taux_commission: 40,
          client: { id: 'cli', raison_sociale: 'Test' },
        },
      },
      contrats: {
        data: [
          {
            id: 'ctr-4',
            ref: 'CTR-T4',
            contract_number: 'DECA004',
            internal_number: '4',
            apprenant_nom: 'Test',
            apprenant_prenom: 'U',
            formation_titre: 'F',
            contract_state: 'ENGAGE',
            npec_amount: 5000,
          },
        ],
      },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 400,
            contrat_id: 'ctr-4',
            amount: 2500,
            line_type: 'PEDAGOGIE',
          },
          {
            eduvia_invoice_id: 400,
            contrat_id: 'ctr-4',
            amount: 100,
            line_type: 'EXAMEN',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-400',
            contrat_id: 'ctr-4',
            step_number: 1,
            eduvia_invoice_id: 400,
            including_pedagogie_amount: 2500,
            opening_date: '2026-01-01',
            paid_at: null,
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const r = await getBillableEvents('proj-1');
    expect(r?.events).toHaveLength(1);
    expect(r?.events[0]?.status).toBe('locked');
    expect(r?.events[0]?.lock_reason).toBe('unknown_line_type');
    expect(r?.events[0]?.unknown_line_types).toEqual(['EXAMEN']);
  });

  it('missing_idcc prime sur unknown_line_type', async () => {
    const { client } = buildSupabase({
      projets: {
        data: {
          id: 'proj-1',
          ref: 'TST',
          taux_commission: 40,
          client: { id: 'cli', raison_sociale: 'Test' },
        },
      },
      contrats: {
        data: [
          {
            id: 'ctr-5',
            ref: 'CTR-T5',
            contract_number: '',
            internal_number: '5',
            apprenant_nom: 'Test',
            apprenant_prenom: 'U',
            formation_titre: 'F',
            contract_state: 'ENGAGE',
            npec_amount: 5000,
            eduvia_company_id: 1,
          },
        ],
      },
      eduvia_companies: { data: [{ eduvia_id: 1, idcc_code: null }] },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 500,
            contrat_id: 'ctr-5',
            amount: 2500,
            line_type: 'PEDAGOGIE',
          },
          {
            eduvia_invoice_id: 500,
            contrat_id: 'ctr-5',
            amount: 100,
            line_type: 'INSCRIPTION',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-500',
            contrat_id: 'ctr-5',
            step_number: 1,
            eduvia_invoice_id: 500,
            including_pedagogie_amount: 2500,
            opening_date: '2026-01-01',
            paid_at: null,
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const r = await getBillableEvents('proj-1');
    expect(r?.events[0]?.lock_reason).toBe('missing_idcc');
  });

  it('unknown_line_type prevaut sur opposite_billed', async () => {
    // Setup : contrat avec DECA present + opco_step deja facture en live
    // (ce qui verrouillerait normalement l'engagement avec 'opposite_billed'),
    // MAIS une ligne de line_type inconnu existe aussi sur le contrat.
    // Resultat attendu : engagement 'locked' avec lock_reason='unknown_line_type'
    // (prioritaire sur opposite_billed selon resolveLock).
    const { client } = buildSupabase({
      projets: {
        data: {
          id: 'proj-prio',
          ref: 'TST-PRIO',
          taux_commission: 40,
          client: { id: 'cli-prio', raison_sociale: 'Test Priorite' },
        },
      },
      contrats: {
        data: [
          {
            id: 'ctr-prio',
            ref: 'CTR-PRIO',
            contract_number: 'DECA999',
            internal_number: 'PRIO-1',
            apprenant_nom: 'Priorite',
            apprenant_prenom: 'Test',
            formation_titre: 'F',
            contract_state: 'ENGAGE',
            npec_amount: 5000,
          },
        ],
      },
      eduvia_invoice_lines: {
        data: [
          // Ligne PEDAGOGIE step 1 (base engagement)
          {
            eduvia_invoice_id: 700,
            contrat_id: 'ctr-prio',
            amount: 2000,
            line_type: 'PEDAGOGIE',
          },
          // Ligne RQTH inconnue sur le meme contrat
          {
            eduvia_invoice_id: 700,
            contrat_id: 'ctr-prio',
            amount: 50,
            line_type: 'RQTH',
          },
          // Ligne step 2 (opco_step) - PEDAGOGIE
          {
            eduvia_invoice_id: 701,
            contrat_id: 'ctr-prio',
            amount: 1000,
            line_type: 'PEDAGOGIE',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-prio-1',
            contrat_id: 'ctr-prio',
            step_number: 1,
            eduvia_invoice_id: 700,
            including_pedagogie_amount: 2000,
            opening_date: '2026-01-01',
            paid_at: null,
            invoice_state: 'REGLE',
          },
          {
            id: 'step-prio-2',
            contrat_id: 'ctr-prio',
            step_number: 2,
            eduvia_invoice_id: 701,
            including_pedagogie_amount: 1000,
            opening_date: '2026-04-01',
            paid_at: '2026-05-01',
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: {
        data: [
          // opco_step (step-prio-2) deja facture en live -> engagement serait
          // normalement lockedByOpco (opposite_billed), SAUF que unknown_line_type
          // est prioritaire.
          {
            event_type: 'opco_step',
            event_source_id: 'step-prio-2',
            contrat_id: 'ctr-prio',
            est_avoir: false,
            facture: { id: 'fac-prio', ref: 'FAC-PRIO-0001', statut: 'emise' },
          },
        ],
      },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const r = await getBillableEvents('proj-prio');

    const engagement = r?.events.find((e) => e.type === 'engagement');
    expect(engagement).toBeDefined();
    // unknown_line_type doit prendre la priorite sur opposite_billed
    expect(engagement!.status).toBe('locked');
    expect(engagement!.lock_reason).toBe('unknown_line_type');
    expect(engagement!.unknown_line_types).toEqual(['RQTH']);
    // locked_by doit etre undefined (unknown_line_type masque opposite_billed)
    expect(engagement!.locked_by).toBeUndefined();
  });

  it('opco_step disponible : montant_brut = somme PEDAGOGIE de l invoice (matos exclu)', async () => {
    const { client } = buildSupabase({
      projets: {
        data: {
          id: 'proj-1',
          ref: 'TST',
          taux_commission: 40,
          client: { id: 'cli', raison_sociale: 'Test' },
        },
      },
      contrats: {
        data: [
          {
            id: 'ctr-6',
            ref: 'CTR-T6',
            contract_number: 'DECA006',
            internal_number: '6',
            apprenant_nom: 'Test',
            apprenant_prenom: 'U',
            formation_titre: 'F',
            contract_state: 'ENGAGE',
            npec_amount: 5000,
          },
        ],
      },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 600,
            contrat_id: 'ctr-6',
            amount: 1500,
            line_type: 'PEDAGOGIE',
          },
          {
            eduvia_invoice_id: 600,
            contrat_id: 'ctr-6',
            amount: 500,
            line_type: 'PREMIEREQUIPEMENT',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-600',
            contrat_id: 'ctr-6',
            step_number: 2,
            eduvia_invoice_id: 600,
            including_pedagogie_amount: 1500,
            opening_date: '2026-04-01',
            paid_at: null,
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const r = await getBillableEvents('proj-1');

    expect(r?.events).toHaveLength(1);
    expect(r?.events[0]).toMatchObject({
      type: 'opco_step',
      step_number: 2,
      montant_brut: 1500,
      montant_commissionne: 600, // 1500 x 40%
      status: 'available',
    });
  });
});

// ---------------------------------------------------------------------------
// Resolution OPCO via IDCC (convention collective de l'employeur)
// ---------------------------------------------------------------------------

describe('getBillableEvents - resolution OPCO', () => {
  it('idcc employeur mappe AKTO -> event opco_code=AKTO, status available', async () => {
    const { client } = buildSupabase({
      projets: {
        data: {
          id: 'proj-opco-1',
          ref: 'TST-OPCO',
          taux_commission: 40,
          client: { id: 'cli-1', raison_sociale: 'Test OPCO' },
        },
      },
      contrats: {
        data: [
          {
            id: 'ctr-opco-1',
            ref: 'CTR-OPCO-1',
            contract_number: '017-AKTO-2026-001',
            internal_number: 'INT-OPCO-1',
            apprenant_nom: 'Martin',
            apprenant_prenom: 'Sophie',
            formation_titre: 'Commerce',
            contract_state: 'ENGAGE',
            npec_amount: 6000,
            eduvia_company_id: 10,
          },
        ],
      },
      eduvia_companies: { data: [{ eduvia_id: 10, idcc_code: '1979' }] },
      opcos: {
        data: [
          {
            code: 'AKTO',
            nom: 'AKTO - Commerce',
            idcc_codes: ['1979', '0030'],
          },
        ],
        error: null,
      },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 1001,
            contrat_id: 'ctr-opco-1',
            amount: 3000,
            line_type: 'PEDAGOGIE',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-opco-1001',
            contrat_id: 'ctr-opco-1',
            step_number: 1,
            eduvia_invoice_id: 1001,
            including_pedagogie_amount: 3000,
            opening_date: '2026-02-01',
            paid_at: null,
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const r = await getBillableEvents('proj-opco-1');

    expect(r?.events).toHaveLength(1);
    const ev = r!.events[0]!;
    expect(ev.status).toBe('available');
    expect(ev.opco_code).toBe('AKTO');
    expect(ev.opco_nom).toBe('AKTO - Commerce');
    expect(ev.lock_reason).toBeUndefined();
  });

  it('idcc employeur non rattache a un OPCO -> locked unknown_opco', async () => {
    const { client } = buildSupabase({
      projets: {
        data: {
          id: 'proj-opco-2',
          ref: 'TST-OPCO2',
          taux_commission: 40,
          client: { id: 'cli-2', raison_sociale: 'Test OPCO 2' },
        },
      },
      contrats: {
        data: [
          {
            id: 'ctr-opco-2',
            ref: 'CTR-OPCO-2',
            contract_number: '999-INCONNU-2026-001',
            internal_number: 'INT-OPCO-2',
            apprenant_nom: 'Durand',
            apprenant_prenom: 'Paul',
            formation_titre: 'Industrie',
            contract_state: 'ENGAGE',
            npec_amount: 4000,
            eduvia_company_id: 11,
          },
        ],
      },
      eduvia_companies: { data: [{ eduvia_id: 11, idcc_code: '4321' }] },
      opcos: { data: [], error: null },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 1002,
            contrat_id: 'ctr-opco-2',
            amount: 2000,
            line_type: 'PEDAGOGIE',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-opco-1002',
            contrat_id: 'ctr-opco-2',
            step_number: 1,
            eduvia_invoice_id: 1002,
            including_pedagogie_amount: 2000,
            opening_date: '2026-03-01',
            paid_at: null,
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const r = await getBillableEvents('proj-opco-2');

    expect(r?.events).toHaveLength(1);
    const ev = r!.events[0]!;
    expect(ev.status).toBe('locked');
    expect(ev.lock_reason).toBe('unknown_opco');
    expect(ev.opco_code).toBeNull();
    expect(ev.opco_nom).toBeNull();
  });

  it('priorite missing_idcc > unknown_opco : idcc employeur null -> lock_reason=missing_idcc', async () => {
    const { client } = buildSupabase({
      projets: {
        data: {
          id: 'proj-opco-3',
          ref: 'TST-OPCO3',
          taux_commission: 40,
          client: { id: 'cli-3', raison_sociale: 'Test OPCO 3' },
        },
      },
      contrats: {
        data: [
          {
            id: 'ctr-opco-3',
            ref: 'CTR-OPCO-3',
            contract_number: 'DECA-OPCO-3',
            internal_number: 'INT-OPCO-3',
            apprenant_nom: 'Leblanc',
            apprenant_prenom: 'Marie',
            formation_titre: 'Sante',
            contract_state: 'ENGAGE',
            npec_amount: 3000,
            eduvia_company_id: 12,
          },
        ],
      },
      eduvia_companies: { data: [{ eduvia_id: 12, idcc_code: null }] },
      opcos: { data: [], error: null },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 1003,
            contrat_id: 'ctr-opco-3',
            amount: 1500,
            line_type: 'PEDAGOGIE',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-opco-1003',
            contrat_id: 'ctr-opco-3',
            step_number: 1,
            eduvia_invoice_id: 1003,
            including_pedagogie_amount: 1500,
            opening_date: '2026-03-15',
            paid_at: null,
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const r = await getBillableEvents('proj-opco-3');

    expect(r?.events).toHaveLength(1);
    const ev = r!.events[0]!;
    expect(ev.status).toBe('locked');
    expect(ev.lock_reason).toBe('missing_idcc');
  });

  it('priorite unknown_opco > unknown_line_type : idcc non mappe + ligne type inconnu -> lock_reason=unknown_opco', async () => {
    const { client } = buildSupabase({
      projets: {
        data: {
          id: 'proj-opco-4',
          ref: 'TST-OPCO4',
          taux_commission: 40,
          client: { id: 'cli-4', raison_sociale: 'Test OPCO 4' },
        },
      },
      contrats: {
        data: [
          {
            id: 'ctr-opco-4',
            ref: 'CTR-OPCO-4',
            contract_number: '888-INCONNU-2026-001',
            internal_number: 'INT-OPCO-4',
            apprenant_nom: 'Petit',
            apprenant_prenom: 'Lucas',
            formation_titre: 'BTP',
            contract_state: 'ENGAGE',
            npec_amount: 5000,
            eduvia_company_id: 13,
          },
        ],
      },
      eduvia_companies: { data: [{ eduvia_id: 13, idcc_code: '4321' }] },
      opcos: { data: [], error: null },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 1004,
            contrat_id: 'ctr-opco-4',
            amount: 2500,
            line_type: 'PEDAGOGIE',
          },
          {
            eduvia_invoice_id: 1004,
            contrat_id: 'ctr-opco-4',
            amount: 100,
            line_type: 'EXAMEN',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-opco-1004',
            contrat_id: 'ctr-opco-4',
            step_number: 1,
            eduvia_invoice_id: 1004,
            including_pedagogie_amount: 2500,
            opening_date: '2026-04-01',
            paid_at: null,
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const r = await getBillableEvents('proj-opco-4');

    expect(r?.events).toHaveLength(1);
    const ev = r!.events[0]!;
    expect(ev.status).toBe('locked');
    expect(ev.lock_reason).toBe('unknown_opco');
  });

  it('plusieurs OPCO sur meme projet -> events distincts avec opco_code different', async () => {
    const { client } = buildSupabase({
      projets: {
        data: {
          id: 'proj-opco-5',
          ref: 'TST-OPCO5',
          taux_commission: 40,
          client: { id: 'cli-5', raison_sociale: 'Test Multi OPCO' },
        },
      },
      contrats: {
        data: [
          {
            id: 'ctr-akto',
            ref: 'CTR-AKTO',
            contract_number: '017-AKTO-2026-001',
            internal_number: 'INT-AKTO',
            apprenant_nom: 'Morel',
            apprenant_prenom: 'Anne',
            formation_titre: 'Commerce',
            contract_state: 'ENGAGE',
            npec_amount: 4000,
            eduvia_company_id: 20,
          },
          {
            id: 'ctr-mob',
            ref: 'CTR-MOB',
            contract_number: '006-MOB-2026-001',
            internal_number: 'INT-MOB',
            apprenant_nom: 'Bernard',
            apprenant_prenom: 'Luc',
            formation_titre: 'Transport',
            contract_state: 'ENGAGE',
            npec_amount: 5000,
            eduvia_company_id: 21,
          },
        ],
      },
      eduvia_companies: {
        data: [
          { eduvia_id: 20, idcc_code: '1979' },
          { eduvia_id: 21, idcc_code: '1090' },
        ],
      },
      opcos: {
        data: [
          { code: 'AKTO', nom: 'AKTO', idcc_codes: ['1979'] },
          {
            code: 'OPCO_MOBILITES',
            nom: 'OPCO Mobilites',
            idcc_codes: ['1090'],
          },
        ],
        error: null,
      },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 2001,
            contrat_id: 'ctr-akto',
            amount: 2000,
            line_type: 'PEDAGOGIE',
          },
          {
            eduvia_invoice_id: 2002,
            contrat_id: 'ctr-mob',
            amount: 2500,
            line_type: 'PEDAGOGIE',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-akto-2001',
            contrat_id: 'ctr-akto',
            step_number: 1,
            eduvia_invoice_id: 2001,
            including_pedagogie_amount: 2000,
            opening_date: '2026-01-01',
            paid_at: null,
            invoice_state: 'REGLE',
          },
          {
            id: 'step-mob-2002',
            contrat_id: 'ctr-mob',
            step_number: 1,
            eduvia_invoice_id: 2002,
            including_pedagogie_amount: 2500,
            opening_date: '2026-01-01',
            paid_at: null,
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const r = await getBillableEvents('proj-opco-5');

    expect(r?.events).toHaveLength(2);
    const aktoEv = r!.events.find((e) => e.contrat_id === 'ctr-akto')!;
    const mobEv = r!.events.find((e) => e.contrat_id === 'ctr-mob')!;

    expect(aktoEv.opco_code).toBe('AKTO');
    expect(aktoEv.opco_nom).toBe('AKTO');
    expect(aktoEv.status).toBe('available');

    expect(mobEv.opco_code).toBe('OPCO_MOBILITES');
    expect(mobEv.opco_nom).toBe('OPCO Mobilites');
    expect(mobEv.status).toBe('available');
  });
});

// ---------------------------------------------------------------------------
// État facture Eduvia (invoice_state)
// ---------------------------------------------------------------------------

describe('getBillableEvents - état facture Eduvia (invoice_state)', () => {
  it('engagement: invoice_state = état de la facture PEDAGOGIE step 1, ignore la facture PREMIEREQUIPEMENT payée', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat()] },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 901,
            contrat_id: 'ctr-1',
            amount: 2000,
            line_type: 'PEDAGOGIE',
          },
          {
            eduvia_invoice_id: 902,
            contrat_id: 'ctr-1',
            amount: 500,
            line_type: 'PREMIEREQUIPEMENT',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-901',
            contrat_id: 'ctr-1',
            step_number: 1,
            eduvia_invoice_id: 901,
            including_pedagogie_amount: 2000,
            opening_date: '2026-02-01',
            paid_at: '2026-02-15',
            invoice_state: 'REGLE',
          },
          {
            id: 'step-902',
            contrat_id: 'ctr-1',
            step_number: 1,
            eduvia_invoice_id: 902,
            including_pedagogie_amount: 0,
            opening_date: '2026-05-07',
            paid_at: '2026-06-01',
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const result = await getBillableEvents('pjt-1');

    expect(result!.events).toHaveLength(1);
    const ev = result!.events[0]!;
    expect(ev.type).toBe('engagement');
    expect(ev.montant_brut).toBe(2000); // PREMIEREQUIPEMENT exclu
    // état de la facture pédagogie (REGLE = payé), équipement exclu de la base
    expect(ev.invoice_state).toBe('REGLE');
    // date d'ouverture = bordereau pédagogie (inv 901), pas l'équipement (inv 902)
    expect(ev.step_opening_date).toBe('2026-02-01');
  });

  it('opco_step: invoice_state = état Eduvia du step + step_paid_at', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat({ contract_state: 'REGLE' })] },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 903,
            contrat_id: 'ctr-1',
            amount: 1500,
            line_type: 'PEDAGOGIE',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-903',
            contrat_id: 'ctr-1',
            step_number: 2,
            eduvia_invoice_id: 903,
            including_pedagogie_amount: 1500,
            opening_date: '2026-03-01',
            paid_at: '2026-03-15',
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const result = await getBillableEvents('pjt-1');

    expect(result!.events).toHaveLength(1);
    const ev = result!.events[0]!;
    expect(ev.type).toBe('opco_step');
    expect(ev.invoice_state).toBe('REGLE');
    expect(ev.step_paid_at).toBe('2026-03-15');
  });

  it('engagement: facturable des que opco_settled_amount >= total_amount, meme si invoice_state=TRANSMIS (premier equipement non regle)', async () => {
    // Cas reel HEOL : l'OPCO a regle l'echeance pedago (2505.6) mais pas le
    // premier equipement (500), donc Eduvia laisse invoice_state=TRANSMIS.
    // Le premier equipement etant hors base commission, le pedago est
    // facturable des maintenant.
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat()] },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 910,
            contrat_id: 'ctr-1',
            amount: 2505.6,
            line_type: 'PEDAGOGIE',
          },
          {
            eduvia_invoice_id: 910,
            contrat_id: 'ctr-1',
            amount: 500,
            line_type: 'PREMIEREQUIPEMENT',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-910',
            contrat_id: 'ctr-1',
            step_number: 1,
            eduvia_invoice_id: 910,
            including_pedagogie_amount: 2505.6,
            total_amount: 2505.6,
            opco_settled_amount: 2505.6,
            net_invoiced_amount: 3005.6,
            opening_date: '2026-06-01',
            paid_at: null,
            invoice_state: 'TRANSMIS',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const result = await getBillableEvents('pjt-1');

    expect(result!.events).toHaveLength(1);
    const ev = result!.events[0]!;
    expect(ev.type).toBe('engagement');
    expect(ev.montant_brut).toBe(2505.6); // premier equipement (500) hors base
    expect(ev.opco_settled_amount).toBe(2505.6);
    expect(ev.net_invoiced_amount).toBe(3005.6); // pedago 2505.6 + equipement 500
  });

  it('engagement: NON facturable tant que opco_settled_amount < total_amount (rien encaisse), invoice_state=TRANSMIS -> en attente', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat()] },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 911,
            contrat_id: 'ctr-1',
            amount: 2505.6,
            line_type: 'PEDAGOGIE',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-911',
            contrat_id: 'ctr-1',
            step_number: 1,
            eduvia_invoice_id: 911,
            including_pedagogie_amount: 2505.6,
            total_amount: 2505.6,
            opco_settled_amount: 0,
            opening_date: '2026-06-01',
            paid_at: null,
            invoice_state: 'TRANSMIS',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const result = await getBillableEvents('pjt-1');

    // pedago non encaisse -> aucun event facturable (bucket "en attente")
    expect(result!.events).toHaveLength(0);
  });

  it('verrou manuel: facturation_verrouillee=true verrouille l event meme si pedago REGLE (visible mais non facturable)', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat({ facturation_verrouillee: true })] },
      eduvia_invoice_lines: {
        data: [
          {
            eduvia_invoice_id: 920,
            contrat_id: 'ctr-1',
            amount: 2000,
            line_type: 'PEDAGOGIE',
          },
        ],
      },
      eduvia_invoice_steps: {
        data: [
          {
            id: 'step-920',
            contrat_id: 'ctr-1',
            step_number: 1,
            eduvia_invoice_id: 920,
            including_pedagogie_amount: 2000,
            total_amount: 2000,
            opco_settled_amount: 2000,
            opening_date: '2026-02-01',
            paid_at: '2026-02-15',
            invoice_state: 'REGLE',
          },
        ],
      },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const result = await getBillableEvents('pjt-1');

    // L'event existe (visible) mais verrouille : jamais selectionnable.
    expect(result!.events).toHaveLength(1);
    const ev = result!.events[0]!;
    expect(ev.status).toBe('locked');
    expect(ev.lock_reason).toBe('verrouille_manuel');
  });
});
