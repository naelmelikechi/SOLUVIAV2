process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests pour lib/queries/billable-events.ts (HEOL / billing_mode=manual).
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
      eduvia_invoice_steps: [
        { data: [] }, // opco_steps REGLE
        { data: [] }, // step1 emis : aucun
      ],
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
      eduvia_invoice_steps: [
        { data: [] }, // opco_steps REGLE : aucun
        {
          // 2 entrees step 1 (cas re-emission apres modif contrat) : on somme
          data: [
            {
              contrat_id: 'ctr-1',
              total_amount: 1000,
              invoice_state: 'TRANSMIS',
            },
            { contrat_id: 'ctr-1', total_amount: 500, invoice_state: 'REGLE' },
          ],
        },
      ],
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
      eduvia_invoice_steps: [
        { data: [] },
        {
          data: [
            {
              contrat_id: 'ctr-1',
              total_amount: 123.45,
              invoice_state: 'REGLE',
            },
          ],
        },
      ],
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
      eduvia_invoice_steps: [
        { data: [] },
        {
          data: [
            { contrat_id: 'ctr-1', total_amount: 2000, invoice_state: 'REGLE' },
          ],
        },
      ],
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
      eduvia_invoice_steps: [
        { data: [] },
        {
          data: [
            { contrat_id: 'ctr-1', total_amount: 2000, invoice_state: 'REGLE' },
          ],
        },
      ],
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
      eduvia_invoice_steps: [
        // opco_step REGLE
        {
          data: [
            {
              id: 'step-1',
              contrat_id: 'ctr-1',
              step_number: 2,
              opening_date: '2026-01-15',
              total_amount: 1000,
              paid_at: '2026-02-01',
              invoice_state: 'REGLE',
            },
          ],
        },
        // step 1 emis pour avoir engagement aussi
        {
          data: [
            { contrat_id: 'ctr-1', total_amount: 2000, invoice_state: 'REGLE' },
          ],
        },
      ],
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
      eduvia_invoice_steps: [
        {
          data: [
            {
              id: 'step-1',
              contrat_id: 'ctr-1',
              step_number: 2,
              opening_date: '2026-01-15',
              total_amount: 1000,
              paid_at: '2026-02-01',
              invoice_state: 'REGLE',
            },
          ],
        },
        {
          data: [
            { contrat_id: 'ctr-1', total_amount: 2000, invoice_state: 'REGLE' },
          ],
        },
      ],
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
    expect(result).toEqual({
      projetId: 'pjt-1',
      projetRef: '0007-HEO-APP',
      clientRaisonSociale: 'Heol Formation',
      tauxCommission: 50,
      events: [],
    });
  });

  it('contrat NON-ENGAGE sans opco_step paye -> aucun event', async () => {
    const mock = buildSupabase({
      projets: { data: projet },
      contrats: { data: [contrat({ contract_state: 'EN_ATTENTE' })] },
      eduvia_invoice_steps: [{ data: [] }, { data: [] }],
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
      eduvia_invoice_steps: [
        { data: [] }, // opco_steps REGLE : aucun
        {
          data: [
            { contrat_id: 'ctr-1', total_amount: 2000, invoice_state: 'REGLE' },
          ],
        },
      ],
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
      eduvia_invoice_steps: [
        {
          data: [
            {
              id: 'step-1',
              contrat_id: 'ctr-1',
              step_number: 2,
              opening_date: '2026-01-15',
              total_amount: 1500,
              paid_at: '2026-02-01',
              invoice_state: 'REGLE',
            },
          ],
        },
        { data: [] }, // step 1 emis : aucun (pas d engagement)
      ],
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
      eduvia_invoice_steps: [
        { data: [] },
        {
          data: [
            { contrat_id: 'ctr-1', total_amount: 3000, invoice_state: 'REGLE' },
          ],
        },
      ],
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
      eduvia_invoice_steps: [
        {
          data: [
            {
              id: 'step-1',
              contrat_id: 'ctr-1',
              step_number: 2,
              opening_date: '2026-01-15',
              total_amount: 1000,
              paid_at: '2026-02-01',
              invoice_state: 'REGLE',
            },
          ],
        },
        {
          data: [
            { contrat_id: 'ctr-1', total_amount: 2000, invoice_state: 'REGLE' },
          ],
        },
      ],
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
