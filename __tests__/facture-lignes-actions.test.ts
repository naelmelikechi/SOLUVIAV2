import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Premiers tests de lib/actions/facture-lignes.ts (audit #122, constat 18b).
 *
 * 408 lignes de mutations de facturation, zero test : aucune occurrence de
 * addLigneToBrouillon, updateLigneInBrouillon, removeLigneFromBrouillon ni
 * recomputeFactureTotaux dans __tests__/, e2e/ ou supabase/tests/. Le test e2e
 * facture-flow passe par createFreeBrouillon, pas par ce module.
 *
 * On couvre les deux invariants que le rapport a identifies comme non couverts :
 *
 *  - Le SIGNE. Sur un avoir, montant_ht doit etre negatif. Le filet DB
 *    `factures_signe_montants_check` ne rattrape une inversion que si le total
 *    bascule positif : sur un avoir multi-lignes deja fortement negatif, une
 *    ligne au mauvais signe reduit la deduction sans faire basculer le total.
 *  - La COHERENCE PROJET (`contrat.projet_id !== facture.projet_id`), qui n'a
 *    aucun filet, ni DB ni applicatif.
 *
 * Plus la garde de statut : on ne modifie pas les lignes d'une facture emise
 * (numerotation continue, obligation legale).
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/guards', () => ({ checkAuth: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/utils/audit', () => ({ logAudit: vi.fn() }));
// assertBrouillon et recomputeFactureTotaux passent par createClient(), qui lit
// les cookies : hors contexte de requete, Next.js leve. On rend le meme client
// mocke que checkAuth.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { checkAuth } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { addLigneToBrouillon } from '@/lib/actions/facture-lignes';

const FACTURE_ID = '11111111-1111-4111-8111-111111111111';
const CONTRAT_ID = '22222222-2222-4222-8222-222222222222';
const PROJET_ID = '33333333-3333-4333-8333-333333333333';
const AUTRE_PROJET = '44444444-4444-4444-8444-444444444444';

interface Scenario {
  facture: {
    id: string;
    statut: string;
    est_avoir: boolean;
    projet_id: string;
    ref: string | null;
    taux_tva: number;
  } | null;
  contrat: { id: string; projet_id: string; archive: boolean } | null;
}

/** Capture ce qui est insere dans facture_lignes. */
const inserted: Record<string, unknown>[] = [];

function buildSupabase(sc: Scenario) {
  return {
    from(table: string) {
      if (table === 'factures') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: sc.facture, error: null }),
              single: async () => ({ data: sc.facture, error: null }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === 'contrats') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: sc.contrat, error: null }),
            }),
          }),
        };
      }
      if (table === 'facture_lignes') {
        return {
          insert: (payload: Record<string, unknown>) => {
            inserted.push(payload);
            return {
              select: () => ({
                single: async () => ({ data: { id: 'ligne-1' }, error: null }),
              }),
            };
          },
          select: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        };
      }
      // Tables touchees par le recalcul des totaux en aval de l'insert
      // (echeances, audit...). Elles ne font pas l'objet de ces assertions :
      // on renvoie un chainable inerte plutot que de lever.
      const inerte: Record<string, unknown> = {
        select: () => inerte,
        insert: async () => ({ data: null, error: null }),
        update: () => inerte,
        delete: () => inerte,
        eq: () => inerte,
        in: () => inerte,
        is: () => inerte,
        order: () => inerte,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(res),
      };
      return inerte;
    },
  };
}

function setAuth(sc: Scenario) {
  const client = buildSupabase(sc);
  vi.mocked(checkAuth).mockResolvedValue({
    ok: true,
    supabase: client,
    user: { id: 'user-1' },
    role: 'admin',
  } as unknown as Awaited<ReturnType<typeof checkAuth>>);
  vi.mocked(createClient).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createClient>>,
  );
}

const brouillon = {
  id: FACTURE_ID,
  statut: 'a_emettre',
  est_avoir: false,
  projet_id: PROJET_ID,
  ref: null,
  taux_tva: 20,
};

const params = {
  factureId: FACTURE_ID,
  contratId: CONTRAT_ID,
  description: 'Ligne de test',
  montantHt: 500,
};

beforeEach(() => {
  inserted.length = 0;
  vi.clearAllMocks();
});

describe('addLigneToBrouillon', () => {
  it('facture normale : le montant est stocke POSITIF', async () => {
    setAuth({
      facture: brouillon,
      contrat: { id: CONTRAT_ID, projet_id: PROJET_ID, archive: false },
    });
    const r = await addLigneToBrouillon(params);
    expect(r.success).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.montant_ht).toBe(500);
  });

  it('avoir : le montant est stocke NEGATIF, meme si on passe un positif', async () => {
    setAuth({
      facture: { ...brouillon, est_avoir: true },
      contrat: { id: CONTRAT_ID, projet_id: PROJET_ID, archive: false },
    });
    const r = await addLigneToBrouillon(params);
    expect(r.success).toBe(true);
    expect(inserted[0]!.montant_ht).toBe(-500);
  });

  it('avoir : un montant deja negatif reste negatif (pas de double inversion)', async () => {
    setAuth({
      facture: { ...brouillon, est_avoir: true },
      contrat: { id: CONTRAT_ID, projet_id: PROJET_ID, archive: false },
    });
    const r = await addLigneToBrouillon({ ...params, montantHt: -500 });
    expect(r.success).toBe(true);
    expect(inserted[0]!.montant_ht).toBe(-500);
  });

  it('refuse un contrat appartenant a un AUTRE projet (aucun filet DB sur ce point)', async () => {
    setAuth({
      facture: brouillon,
      contrat: { id: CONTRAT_ID, projet_id: AUTRE_PROJET, archive: false },
    });
    const r = await addLigneToBrouillon(params);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/autre projet/i);
    expect(inserted).toHaveLength(0);
  });

  it('refuse un contrat introuvable', async () => {
    setAuth({ facture: brouillon, contrat: null });
    const r = await addLigneToBrouillon(params);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/introuvable/i);
    expect(inserted).toHaveLength(0);
  });

  it('refuse une facture DEJA EMISE (numerotation continue, obligation legale)', async () => {
    setAuth({
      facture: { ...brouillon, statut: 'emise', ref: 'FAC-DUP-0001' },
      contrat: { id: CONTRAT_ID, projet_id: PROJET_ID, archive: false },
    });
    const r = await addLigneToBrouillon(params);
    expect(r.success).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it('refuse une facture inexistante', async () => {
    setAuth({
      facture: null,
      contrat: { id: CONTRAT_ID, projet_id: PROJET_ID, archive: false },
    });
    const r = await addLigneToBrouillon(params);
    expect(r.success).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it('valide les entrees avant tout acces DB : montant aberrant et UUID invalide', async () => {
    setAuth({
      facture: brouillon,
      contrat: { id: CONTRAT_ID, projet_id: PROJET_ID, archive: false },
    });

    const aberrant = await addLigneToBrouillon({
      ...params,
      montantHt: 50_000_000,
    });
    expect(aberrant.success).toBe(false);
    expect(aberrant.error).toMatch(/aberrant/i);

    const mauvaisId = await addLigneToBrouillon({
      ...params,
      contratId: 'pas-un-uuid',
    });
    expect(mauvaisId.success).toBe(false);

    expect(inserted).toHaveLength(0);
  });

  it('un montant a zero est ACCEPTE (borne du schema : ±10 M, zero inclus)', async () => {
    // Comportement reel du schema, verifie et non suppose : montantHtSchema ne
    // borne que la finitude et ±10 000 000. Une ligne a 0 est donc legitime
    // (ligne offerte, regularisation) et n'affecte pas les totaux.
    setAuth({
      facture: brouillon,
      contrat: { id: CONTRAT_ID, projet_id: PROJET_ID, archive: false },
    });
    const r = await addLigneToBrouillon({ ...params, montantHt: 0 });
    expect(r.success).toBe(true);
    expect(inserted[0]!.montant_ht).toBe(0);
  });

  it('herite du taux de TVA de l en-tete quand aucun taux de ligne n est fourni', async () => {
    setAuth({
      facture: { ...brouillon, taux_tva: 10 },
      contrat: { id: CONTRAT_ID, projet_id: PROJET_ID, archive: false },
    });
    await addLigneToBrouillon(params);
    expect(inserted[0]!.taux_tva_ligne).toBe(10);
  });

  it('les champs de snapshot echeancier restent NULL quand non fournis', async () => {
    // NULL plutot que 0 : une ligne libre ne participe pas a la formule
    // NPEC x taux x quote-part et ne doit pas leurrer
    // detectNpecChangeAjustement.
    setAuth({
      facture: brouillon,
      contrat: { id: CONTRAT_ID, projet_id: PROJET_ID, archive: false },
    });
    await addLigneToBrouillon(params);
    expect(inserted[0]!.npec_snapshot).toBeNull();
    expect(inserted[0]!.taux_commission_snapshot).toBeNull();
    expect(inserted[0]!.quote_part).toBeNull();
    expect(inserted[0]!.mois_relatif).toBeNull();
  });
});
