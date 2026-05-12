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
  const cursor: Record<string, number> = {};

  function nextResult(table: string): TableResult {
    const r = tableResults[table];
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

  it('base = somme des step 1 avec invoice_state non null (pas NPEC contractuel)', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat({ npec_amount: 8000 })] },
      // 2 lignes PEDAGOGIE sur des step 1 differents (cas re-emission apres modif contrat)
      eduvia_invoice_lines: {
        data: [
          { eduvia_invoice_id: 101, contrat_id: 'ctr-1', amount: 1000, line_type: 'PEDAGOGIE' },
          { eduvia_invoice_id: 102, contrat_id: 'ctr-1', amount: 500, line_type: 'PEDAGOGIE' },
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
    expect(ev.montant_brut).toBe(1500);
    // commission 50% -> 750
    expect(ev.montant_commissionne).toBe(750);
    expect(ev.status).toBe('available');
  });

  it('commission arrondie au centime', async () => {
    const mock = buildSupabase({
      projets: { data: { ...projet, taux_commission: 33 } },
      contrats: { data: [contrat()] },
      eduvia_invoice_lines: {
        data: [
          { eduvia_invoice_id: 103, contrat_id: 'ctr-1', amount: 123.45, line_type: 'PEDAGOGIE' },
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
          { eduvia_invoice_id: 201, contrat_id: 'ctr-1', amount: 2000, line_type: 'PEDAGOGIE' },
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
          { eduvia_invoice_id: 202, contrat_id: 'ctr-1', amount: 2000, line_type: 'PEDAGOGIE' },
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
          { eduvia_invoice_id: 301, contrat_id: 'ctr-1', amount: 1000, line_type: 'PEDAGOGIE' },
          { eduvia_invoice_id: 302, contrat_id: 'ctr-1', amount: 2000, line_type: 'PEDAGOGIE' },
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
          { eduvia_invoice_id: 401, contrat_id: 'ctr-1', amount: 1000, line_type: 'PEDAGOGIE' },
          { eduvia_invoice_id: 402, contrat_id: 'ctr-1', amount: 2000, line_type: 'PEDAGOGIE' },
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
// DECA manquant
// ---------------------------------------------------------------------------

describe('getBillableEvents - DECA manquant', () => {
  it('event engagement est "locked" avec lock_reason "missing_deca" si contract_number null', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat({ contract_number: null })] },
      eduvia_invoice_lines: {
        data: [
          { eduvia_invoice_id: 501, contrat_id: 'ctr-1', amount: 2000, line_type: 'PEDAGOGIE' },
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
    expect(ev.lock_reason).toBe('missing_deca');
    expect(ev.locked_by).toBeUndefined();
  });

  it('event opco_step est "locked" avec lock_reason "missing_deca" si contract_number vide', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: {
        data: [contrat({ contract_number: '  ', contract_state: 'REGLE' })],
      },
      eduvia_invoice_lines: {
        data: [
          { eduvia_invoice_id: 601, contrat_id: 'ctr-1', amount: 1500, line_type: 'PEDAGOGIE' },
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
    expect(ev.lock_reason).toBe('missing_deca');
    expect(ev.locked_by).toBeUndefined();
  });

  it('event reste "available" si contract_number renseigne', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat({ contract_number: 'DECA-2026-001' })] },
      eduvia_invoice_lines: {
        data: [
          { eduvia_invoice_id: 701, contrat_id: 'ctr-1', amount: 3000, line_type: 'PEDAGOGIE' },
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
    expect(ev.lock_reason).toBeUndefined();
  });

  it('missing_deca prevaut sur opposite_billed (verrou prioritaire)', async () => {
    // Contrat sans DECA ET avec engagement deja facture.
    // L opco_step serait normalement lockedByEngagement,
    // mais missing_deca arrive en premier dans le ternaire.
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat({ contract_number: null })] },
      eduvia_invoice_lines: {
        data: [
          { eduvia_invoice_id: 801, contrat_id: 'ctr-1', amount: 1000, line_type: 'PEDAGOGIE' },
          { eduvia_invoice_id: 802, contrat_id: 'ctr-1', amount: 2000, line_type: 'PEDAGOGIE' },
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
    // missing_deca doit prendre le dessus sur opposite_billed
    expect(opco.lock_reason).toBe('missing_deca');
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
        data: { id: 'proj-1', ref: 'TST-001', taux_commission: 40,
          client: { id: 'cli-1', raison_sociale: 'Test' } },
      },
      contrats: { data: [{ id: 'ctr-1', ref: 'CTR-T1', contract_number: 'DECA001',
        internal_number: '1', apprenant_nom: 'Test', apprenant_prenom: 'User',
        formation_titre: 'F', contract_state: 'ENGAGE', npec_amount: 5000 }] },
      eduvia_invoice_lines: { data: [{
        eduvia_invoice_id: 100, contrat_id: 'ctr-1', amount: 2500,
        line_type: 'PEDAGOGIE',
      }] },
      eduvia_invoice_steps: { data: [{
        id: 'step-uuid-100', contrat_id: 'ctr-1', step_number: 1,
        eduvia_invoice_id: 100, including_pedagogie_amount: 2500,
        opening_date: '2026-01-01', paid_at: null, invoice_state: 'TRANSMIS',
      }] },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValueOnce(client as never);

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const r = await getBillableEvents('proj-1');

    expect(r?.events).toHaveLength(1);
    expect(r?.events[0]).toMatchObject({
      type: 'engagement', montant_brut: 2500, montant_commissionne: 1000,
      status: 'available',
    });
  });

  it('PEDAGOGIE + PREMIEREQUIPEMENT dans la meme invoice -> base = PEDAGOGIE seul', async () => {
    const { client } = buildSupabase({
      projets: { data: { id: 'proj-1', ref: 'TST', taux_commission: 40,
        client: { id: 'cli', raison_sociale: 'Test' } } },
      contrats: { data: [{ id: 'ctr-2', ref: 'CTR-T2', contract_number: 'DECA002',
        internal_number: '2', apprenant_nom: 'Test', apprenant_prenom: 'User',
        formation_titre: 'F', contract_state: 'ENGAGE', npec_amount: 5000 }] },
      eduvia_invoice_lines: { data: [
        { eduvia_invoice_id: 200, contrat_id: 'ctr-2', amount: 2500, line_type: 'PEDAGOGIE' },
        { eduvia_invoice_id: 200, contrat_id: 'ctr-2', amount: 500, line_type: 'PREMIEREQUIPEMENT' },
      ] },
      eduvia_invoice_steps: { data: [{ id: 'step-200', contrat_id: 'ctr-2', step_number: 1,
        eduvia_invoice_id: 200, including_pedagogie_amount: 2500,
        opening_date: '2026-01-01', paid_at: null, invoice_state: 'TRANSMIS' }] },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValueOnce(client as never);

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const r = await getBillableEvents('proj-1');

    expect(r?.events).toHaveLength(1);
    expect(r?.events[0]?.montant_brut).toBe(2500);
    expect(r?.events[0]?.montant_commissionne).toBe(1000);
  });

  it('PREMIEREQUIPEMENT seul (sans PEDAGOGIE) -> pas d event engagement', async () => {
    const { client } = buildSupabase({
      projets: { data: { id: 'proj-1', ref: 'TST', taux_commission: 40,
        client: { id: 'cli', raison_sociale: 'Test' } } },
      contrats: { data: [{ id: 'ctr-3', ref: 'CTR-T3', contract_number: 'DECA003',
        internal_number: '3', apprenant_nom: 'Test', apprenant_prenom: 'U',
        formation_titre: 'F', contract_state: 'ENGAGE', npec_amount: 5000 }] },
      eduvia_invoice_lines: { data: [
        { eduvia_invoice_id: 300, contrat_id: 'ctr-3', amount: 500, line_type: 'PREMIEREQUIPEMENT' },
      ] },
      eduvia_invoice_steps: { data: [{ id: 'step-300', contrat_id: 'ctr-3', step_number: 1,
        eduvia_invoice_id: 300, including_pedagogie_amount: 0,
        opening_date: '2026-01-01', paid_at: null, invoice_state: 'TRANSMIS' }] },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValueOnce(client as never);

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const r = await getBillableEvents('proj-1');
    expect(r?.events).toHaveLength(0);
  });

  it('line_type inconnu sur le contrat -> tous ses events sont locked unknown_line_type', async () => {
    const { client } = buildSupabase({
      projets: { data: { id: 'proj-1', ref: 'TST', taux_commission: 40,
        client: { id: 'cli', raison_sociale: 'Test' } } },
      contrats: { data: [{ id: 'ctr-4', ref: 'CTR-T4', contract_number: 'DECA004',
        internal_number: '4', apprenant_nom: 'Test', apprenant_prenom: 'U',
        formation_titre: 'F', contract_state: 'ENGAGE', npec_amount: 5000 }] },
      eduvia_invoice_lines: { data: [
        { eduvia_invoice_id: 400, contrat_id: 'ctr-4', amount: 2500, line_type: 'PEDAGOGIE' },
        { eduvia_invoice_id: 400, contrat_id: 'ctr-4', amount: 100, line_type: 'EXAMEN' },
      ] },
      eduvia_invoice_steps: { data: [{ id: 'step-400', contrat_id: 'ctr-4', step_number: 1,
        eduvia_invoice_id: 400, including_pedagogie_amount: 2500,
        opening_date: '2026-01-01', paid_at: null, invoice_state: 'TRANSMIS' }] },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValueOnce(client as never);

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const r = await getBillableEvents('proj-1');
    expect(r?.events).toHaveLength(1);
    expect(r?.events[0]?.status).toBe('locked');
    expect(r?.events[0]?.lock_reason).toBe('unknown_line_type');
    expect(r?.events[0]?.unknown_line_types).toEqual(['EXAMEN']);
  });

  it('missing_deca prime sur unknown_line_type', async () => {
    const { client } = buildSupabase({
      projets: { data: { id: 'proj-1', ref: 'TST', taux_commission: 40,
        client: { id: 'cli', raison_sociale: 'Test' } } },
      contrats: { data: [{ id: 'ctr-5', ref: 'CTR-T5', contract_number: '',
        internal_number: '5', apprenant_nom: 'Test', apprenant_prenom: 'U',
        formation_titre: 'F', contract_state: 'ENGAGE', npec_amount: 5000 }] },
      eduvia_invoice_lines: { data: [
        { eduvia_invoice_id: 500, contrat_id: 'ctr-5', amount: 2500, line_type: 'PEDAGOGIE' },
        { eduvia_invoice_id: 500, contrat_id: 'ctr-5', amount: 100, line_type: 'INSCRIPTION' },
      ] },
      eduvia_invoice_steps: { data: [{ id: 'step-500', contrat_id: 'ctr-5', step_number: 1,
        eduvia_invoice_id: 500, including_pedagogie_amount: 2500,
        opening_date: '2026-01-01', paid_at: null, invoice_state: 'TRANSMIS' }] },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValueOnce(client as never);

    const { getBillableEvents } = await import('@/lib/queries/billable-events');
    const r = await getBillableEvents('proj-1');
    expect(r?.events[0]?.lock_reason).toBe('missing_deca');
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
            invoice_state: 'TRANSMIS',
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
    vi.mocked(createClient).mockResolvedValueOnce(client as never);

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
      projets: { data: { id: 'proj-1', ref: 'TST', taux_commission: 40,
        client: { id: 'cli', raison_sociale: 'Test' } } },
      contrats: { data: [{ id: 'ctr-6', ref: 'CTR-T6', contract_number: 'DECA006',
        internal_number: '6', apprenant_nom: 'Test', apprenant_prenom: 'U',
        formation_titre: 'F', contract_state: 'ENGAGE', npec_amount: 5000 }] },
      eduvia_invoice_lines: { data: [
        { eduvia_invoice_id: 600, contrat_id: 'ctr-6', amount: 1500, line_type: 'PEDAGOGIE' },
        { eduvia_invoice_id: 600, contrat_id: 'ctr-6', amount: 500, line_type: 'PREMIEREQUIPEMENT' },
      ] },
      eduvia_invoice_steps: { data: [{ id: 'step-600', contrat_id: 'ctr-6', step_number: 2,
        eduvia_invoice_id: 600, including_pedagogie_amount: 1500,
        opening_date: '2026-04-01', paid_at: null, invoice_state: 'TRANSMIS' }] },
      facture_lignes: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValueOnce(client as never);

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
