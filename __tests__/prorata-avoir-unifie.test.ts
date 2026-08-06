import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression (audit #122, constat 15) : le prorata de rupture propose dans l'UI
 * n'etait pas celui du pipeline d'ajustements.
 *
 *   - UI      : computeProrataAvoir, prorata LINEAIRE de 30,4375 jours par mois.
 *   - Pipeline: computeProrataRupture, JALON-AWARE.
 *
 * Sur l'echeancier front-load du rapport (contrat de 12 mois demarre le
 * 2026-01-01, NPEC 12 000, taux 10 %, seul le jalon M+3 facture soit 300 HT,
 * rupture au 2026-07-01) :
 *
 *   pipeline  -> 0,00 EUR   (gagne 600 > facture 300, SOLUVIA est crediteur)
 *   UI        -> 151,33 EUR pre-rempli dans le champ d'avoir
 *
 * C'est bien l'UI qui avait tort, et aucun garde-fou ne portait sur la justesse
 * du montant : les controles client et serveur ne verifient que
 * « montant <= facture origine », et resolveAjustement ne controle que le signe.
 * Pire, computeProrataRupture rendant 0, aucun ajustement pending n'etait cree :
 * il n'y avait meme pas deux chiffres cote a cote que le CDP aurait pu comparer.
 *
 * computeProrataAvoir delegue desormais a computeProrataRupture, par CONTRAT.
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/guards', () => ({ checkAuth: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/utils/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/queries/societes-emettrices', () => ({
  getDefaultSocieteEmettriceId: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

// Les deux collaborateurs charges depuis la base sont mockes : ce test porte sur
// la DELEGATION au calcul jalon-aware et sur l'agregation par contrat, pas sur
// le chargement. computeProrataRupture, lui, n'est PAS mocke : c'est le calcul
// dont on veut verifier qu'il est bien celui utilise.
const loadBilledLinesMock = vi.fn();
vi.mock('@/lib/echeancier/ajustements', () => ({
  loadBilledLines: (...a: unknown[]) => loadBilledLinesMock(...(a as [])),
}));
const loadTotalCommissionMock = vi.fn();
vi.mock('@/lib/echeancier/commission-contrat', () => ({
  loadTotalCommissionContrat: (...a: unknown[]) =>
    loadTotalCommissionMock(...(a as [])),
}));

import { checkAuth } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { computeProrataAvoir } from '@/lib/actions/factures/avoirs';

const FACTURE_ID = '11111111-1111-4111-8111-111111111111';
const CONTRAT_ID = '22222222-2222-4222-8222-222222222222';

/** Lignes de la facture origine renvoyees par le select mocke. */
function setLignes(
  lignes: {
    montant_ht: number;
    contrat_id: string;
    contrat: Record<string, unknown> | null;
  }[],
) {
  const client = {
    from: () => ({
      select: () => ({
        eq: async () => ({ data: lignes, error: null }),
      }),
    }),
  };
  vi.mocked(checkAuth).mockResolvedValue({
    ok: true,
    supabase: client,
    user: { id: 'u1' },
    role: 'admin',
  } as unknown as Awaited<ReturnType<typeof checkAuth>>);
  vi.mocked(createClient).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createClient>>,
  );
}

const CONTRAT_12_MOIS = {
  ref: 'CTR-00187',
  apprenant_nom: 'Doe',
  apprenant_prenom: 'Jane',
  date_debut: '2026-01-01',
  duree_mois: 12,
  projets: { echeancier_template_id: null, echeancier_override: null },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeProrataAvoir : aligne sur le calcul du pipeline', () => {
  it('scenario chiffre du rapport : propose 0,00 et non 151,33', async () => {
    setLignes([
      { montant_ht: 300, contrat_id: CONTRAT_ID, contrat: CONTRAT_12_MOIS },
    ]);
    // Seul le jalon M+3 est facture : 12 000 x 10 % x (3/12) = 300 HT.
    loadBilledLinesMock.mockResolvedValue([
      {
        montant_ht: 300,
        npec_snapshot: 12000,
        taux_commission_snapshot: 10,
        quote_part: 0.25,
        mois_relatif: 3,
        facture_id: FACTURE_ID,
        facture_ref: 'FAC-DUP-0001',
      },
    ]);
    // Commission de l'echeancier COMPLET : 12 000 x 10 % = 1 200 HT.
    loadTotalCommissionMock.mockResolvedValue(1200);

    const r = await computeProrataAvoir({
      factureOrigineId: FACTURE_ID,
      dateRupture: '2026-07-01',
    });

    expect(r.success).toBe(true);
    // A 6 mois sur 12, le gagne est 600 alors que seuls 300 ont ete factures :
    // SOLUVIA est crediteur de 300 et ne doit RIEN rembourser.
    expect(r.suggestedAmount).toBe(0);
    // Le prorata lineaire de l'ancienne implementation donnait 151,33.
    expect(r.suggestedAmount).not.toBe(151.33);
  });

  it('rembourse bien quand le facture depasse le gagne', async () => {
    setLignes([
      { montant_ht: 900, contrat_id: CONTRAT_ID, contrat: CONTRAT_12_MOIS },
    ]);
    // 900 HT deja factures (jalons M+3 et suivants), gagne a 6 mois = 600.
    loadBilledLinesMock.mockResolvedValue([
      {
        montant_ht: 900,
        npec_snapshot: 12000,
        taux_commission_snapshot: 10,
        quote_part: 0.75,
        mois_relatif: 3,
        facture_id: FACTURE_ID,
        facture_ref: 'FAC-DUP-0001',
      },
    ]);
    loadTotalCommissionMock.mockResolvedValue(1200);

    const r = await computeProrataAvoir({
      factureOrigineId: FACTURE_ID,
      dateRupture: '2026-07-01',
    });

    expect(r.success).toBe(true);
    // 900 factures - 600 gagnes = 300 a rendre.
    expect(r.suggestedAmount).toBe(300);
  });

  it('agrege PAR CONTRAT, et non par ligne', async () => {
    // Trois apprentis a 300 sur le meme contrat : l'ancienne implementation
    // sommait ligne par ligne sans regrouper, ce qui gonflait la suggestion.
    setLignes([
      { montant_ht: 300, contrat_id: CONTRAT_ID, contrat: CONTRAT_12_MOIS },
      { montant_ht: 300, contrat_id: CONTRAT_ID, contrat: CONTRAT_12_MOIS },
      { montant_ht: 300, contrat_id: CONTRAT_ID, contrat: CONTRAT_12_MOIS },
    ]);
    loadBilledLinesMock.mockResolvedValue([
      {
        montant_ht: 900,
        npec_snapshot: 12000,
        taux_commission_snapshot: 10,
        quote_part: 0.75,
        mois_relatif: 3,
        facture_id: FACTURE_ID,
        facture_ref: 'FAC-DUP-0001',
      },
    ]);
    loadTotalCommissionMock.mockResolvedValue(1200);

    const r = await computeProrataAvoir({
      factureOrigineId: FACTURE_ID,
      dateRupture: '2026-07-01',
    });

    // Un seul contrat concerne => une seule entree de breakdown, et le calcul
    // n'est fait qu'une fois.
    expect(r.breakdown).toHaveLength(1);
    expect(loadBilledLinesMock).toHaveBeenCalledTimes(1);
    expect(r.breakdown![0]!.montantLigneHt).toBe(900);
    expect(r.suggestedAmount).toBe(300);
  });

  it('sans dates de contrat : remboursement integral propose pour arbitrage', async () => {
    setLignes([
      {
        montant_ht: 500,
        contrat_id: CONTRAT_ID,
        contrat: { ...CONTRAT_12_MOIS, date_debut: null, duree_mois: null },
      },
    ]);

    const r = await computeProrataAvoir({
      factureOrigineId: FACTURE_ID,
      dateRupture: '2026-07-01',
    });

    expect(r.suggestedAmount).toBe(500);
    // Aucun calcul de prorata n'est tente : rien a charger.
    expect(loadBilledLinesMock).not.toHaveBeenCalled();
  });
});
