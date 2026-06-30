process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

const VALID_DEVIS_UUID = '33333333-3333-4333-8333-333333333333';
const VALID_CLIENT_UUID = '11111111-1111-4111-8111-111111111111';

const recordedInserts: Array<{ table: string; payload: unknown }> = [];
const recordedRpc: Array<{ fn: string; args: unknown }> = [];
let rpcError: { message: string } | null = null;

function buildSupabase() {
  return {
    from(table: string) {
      return {
        select() {
          // .from('factures').select('montant_ht').eq('devis_id', id)
          return { eq: () => Promise.resolve({ data: [], error: null }) };
        },
        insert(payload: unknown) {
          recordedInserts.push({ table, payload });
          if (table === 'factures') {
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: 'fac-devis-id' },
                    error: null,
                  }),
              }),
            };
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
    rpc(fn: string, args: unknown) {
      recordedRpc.push({ fn, args });
      return Promise.resolve({
        data: rpcError ? null : 'projet-libre-id',
        error: rpcError,
      });
    },
  };
}

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/utils/audit', () => ({ logAudit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => buildSupabase()),
}));
vi.mock('@/lib/queries/users', () => ({
  getUser: vi.fn(async () => ({ id: 'admin-1', role: 'admin' })),
}));
vi.mock('@/lib/queries/parametres', () => ({
  getDelaiEcheanceJours: vi.fn(async () => 30),
}));
vi.mock('@/lib/queries/devis', () => ({
  getDevisById: vi.fn(async () => ({
    id: VALID_DEVIS_UUID,
    client_id: VALID_CLIENT_UUID,
    societe_emettrice_id: 'soc-1',
    statut: 'accepte',
    montant_ht: 1000,
    ref: 'DEV-001',
    objet: 'Prestation conseil',
    conditions_reglement: '30 jours',
    lignes: [
      {
        libelle: 'Conseil',
        description: '',
        taux_tva: 20,
        total_ht: 1000,
      },
    ],
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  recordedInserts.length = 0;
  recordedRpc.length = 0;
  rpcError = null;
});

describe('createFactureFromDevis - rattachement projet libre', () => {
  it('rattache la facture au projet libre du client du devis', async () => {
    // Import dynamique (frontiere de chargement de module) : le module sous test
    // doit etre charge apres l'enregistrement des vi.mock pour recevoir les
    // dependances mockees (createClient, getUser, getDevisById, ...). Un import
    // statique ne convient pas car il fige les dependances au chargement du test.
    const { createFactureFromDevis } =
      await import('@/lib/actions/devis-to-facture');
    const r = await createFactureFromDevis({
      devisId: VALID_DEVIS_UUID,
      mode: 'solde',
    });
    expect(r.success).toBe(true);

    expect(recordedRpc[0]).toEqual({
      fn: 'get_or_create_projet_libre',
      args: { p_client_id: VALID_CLIENT_UUID },
    });

    const factureInsert = recordedInserts.find((i) => i.table === 'factures');
    expect(factureInsert).toBeDefined();
    const payload = factureInsert!.payload as Record<string, unknown>;
    expect(payload.projet_id).toBe('projet-libre-id');
    expect(payload.client_id).toBe(VALID_CLIENT_UUID);
  });

  it('refuse si getOrCreateProjetLibre échoue (projet libre indisponible)', async () => {
    // Import dynamique requis : exception "frontiere de chargement de module".
    // Le module sous test doit etre charge apres l'enregistrement des vi.mock ;
    // un import statique figerait les dependances reelles -> statique impossible.
    const { createFactureFromDevis } =
      await import('@/lib/actions/devis-to-facture');
    rpcError = { message: 'projet libre KO' };
    const r = await createFactureFromDevis({
      devisId: VALID_DEVIS_UUID,
      mode: 'solde',
    });
    expect(r.success).toBe(false);
    // Narrowing du Result discrimine (pas de cast inline) pour lire .error.
    if (r.success === false) {
      expect(r.error).toMatch(/projet libre KO/);
    }
    // Court-circuit avant ecriture DB : aucune facture ne doit etre inseree.
    const factureInsert = recordedInserts.find((i) => i.table === 'factures');
    expect(factureInsert).toBeUndefined();
  });
});
