import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression (audit #122, constat 10) : une seconde opportunite gagnee sur le
 * meme compte creait un client EN DOUBLE.
 *
 * La seule deduplication etait `if (opp.client_id) return opp.client_id`, donc
 * par OPPORTUNITE, jamais par COMPTE. L'INSERT dans `clients` etait
 * inconditionnel, et il n'existe ni back-link `crm.comptes.client_id`, ni
 * controle par SIRET : `clients` n'a d'UNIQUE que sur `trigramme`.
 *
 * Scenario : le compte « DUPONT SA » a l'opportunite A gagnee en mars, un client
 * est cree (trigramme DUP). En juillet l'opportunite B du meme compte passe en
 * « gagnee » : `client_id` est NULL sur B, donc un SECOND client est insere avec
 * la meme raison sociale et le meme SIRET. Projets, contrats Eduvia, factures et
 * encours se repartissent alors silencieusement sur deux fiches, et la serie de
 * facturation se scinde.
 *
 * Frequence structurelle : le modele CRM est explicitement multi-sessions par
 * compte (volume_an1/an2/an3, mois_demarrage). Une deuxieme promotion vendue au
 * meme client l'annee suivante est le cas NOMINAL.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/utils/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/queries/passation', () => ({
  buildSyntheseSnapshotFromOpportunite: vi.fn(async () => ({})),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/crm/supabase/admin', () => ({ createCrmAdminClient: vi.fn() }));

import { createAdminClient } from '@/lib/supabase/admin';
import { createCrmAdminClient } from '@/lib/crm/supabase/admin';
import { createClientFromCompte } from '@/lib/crm/actions/pont';

const OPP_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COMPTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CLIENT_EXISTANT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

/** Traces des ecritures, pour verifier qu'aucun client n'est insere en double. */
let clientsInseres: Record<string, unknown>[];
let oppUpdates: Record<string, unknown>[];

/**
 * @param dejaLie client_id deja porte par une AUTRE opportunite du meme compte
 */
function setupCrm(dejaLie: string | null) {
  clientsInseres = [];
  oppUpdates = [];

  const crm = {
    from(table: string) {
      if (table === 'opportunites') {
        return {
          select: () => ({
            eq: (col: string) => {
              // Lecture de l'opportunite courante.
              if (col === 'id') {
                return {
                  maybeSingle: async () => ({
                    data: {
                      id: OPP_B,
                      compte_id: COMPTE,
                      owner_id: 'owner-1',
                      client_id: null,
                    },
                  }),
                };
              }
              // Recherche d'une autre opportunite du meme compte deja liee.
              return {
                not: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: dejaLie ? { client_id: dejaLie } : null,
                    }),
                  }),
                }),
              };
            },
            // Non utilise ici, mais garde le mock tolerant.
            maybeSingle: async () => ({ data: null }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async () => {
              oppUpdates.push(payload);
              return { error: null };
            },
          }),
        };
      }
      if (table === 'comptes') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { nom: 'DUPONT SA', siret: '12345678901234' },
              }),
            }),
          }),
        };
      }
      throw new Error(`table crm non mockee : ${table}`);
    },
  };

  const pub = {
    from(table: string) {
      if (table === 'clients') {
        return {
          insert: (payload: Record<string, unknown>) => {
            clientsInseres.push(payload);
            return {
              select: () => ({
                single: async () => ({
                  data: { id: 'nouveau-client' },
                  error: null,
                }),
              }),
            };
          },
        };
      }
      // Tables touchees en aval (audit, synthese...) : chainable inerte.
      const inerte: Record<string, unknown> = {
        select: () => inerte,
        insert: async () => ({ data: null, error: null }),
        update: () => inerte,
        eq: () => inerte,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
      };
      return inerte;
    },
  };

  vi.mocked(createCrmAdminClient).mockReturnValue(
    crm as unknown as ReturnType<typeof createCrmAdminClient>,
  );
  vi.mocked(createAdminClient).mockReturnValue(
    pub as unknown as ReturnType<typeof createAdminClient>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('createClientFromCompte : deduplication par compte', () => {
  it('une 2e opportunite gagnee sur le meme compte REUTILISE le client existant', async () => {
    setupCrm(CLIENT_EXISTANT);

    const id = await createClientFromCompte(OPP_B);

    expect(id).toBe(CLIENT_EXISTANT);
    // Le point central : AUCUN client insere.
    expect(clientsInseres).toHaveLength(0);
    // Et l'opportunite courante est rattachee, pour que le prochain passage
    // sorte au premier test.
    expect(oppUpdates).toEqual([{ client_id: CLIENT_EXISTANT }]);
  });

  it('premier client du compte : il est bien cree', async () => {
    setupCrm(null);

    const id = await createClientFromCompte(OPP_B);

    expect(id).toBe('nouveau-client');
    expect(clientsInseres).toHaveLength(1);
    expect(clientsInseres[0]!.raison_sociale).toBe('DUPONT SA');
    expect(clientsInseres[0]!.siret).toBe('12345678901234');
  });
});
