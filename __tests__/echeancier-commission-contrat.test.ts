import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { loadTotalCommissionContrat } from '@/lib/echeancier/commission-contrat';
import type { BilledLine } from '@/lib/echeancier/calc';

/**
 * `loadTotalCommissionContrat` est la reference "gagne a 100 %" de
 * `computeProrataRupture` : elle decide la BASE de commission d'un contrat.
 * Une erreur ici fausse directement le montant d'avoir propose sur une rupture.
 *
 * Le test de la PR d'origine (`prorata-avoir-unifie.test.ts`) mocke ce module
 * pour tester l'appelant : la fonction reelle n'y est donc jamais executee.
 * Ce fichier l'exerce pour de vrai, avec un stub Supabase minimal.
 */

function makeSupabase(templates: unknown[]) {
  const eq = vi.fn().mockResolvedValue({ data: templates });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return {
    client: { from } as unknown as SupabaseClient<Database>,
    from,
    select,
    eq,
  };
}

function ligne(over: Partial<BilledLine> = {}): BilledLine {
  return {
    facture_id: 'f1',
    facture_ref: 'FAC-SOL-0001',
    mois_relatif: 0,
    montant_ht: 0,
    npec_snapshot: 5_000,
    taux_commission_snapshot: 10,
    quote_part: 1,
    ...over,
  };
}

const TEMPLATE_DEFAUT = {
  id: 't-def',
  nom: 'Standard',
  is_default: true,
  jalons: [
    { mois_relatif: 0, quote_part: 0.4 },
    { mois_relatif: 6, quote_part: 0.6 },
  ],
};

describe('loadTotalCommissionContrat', () => {
  it('sans ligne facturee : renvoie 0 sans interroger la base', async () => {
    const sb = makeSupabase([TEMPLATE_DEFAUT]);

    const total = await loadTotalCommissionContrat(sb.client, null, [], 12);

    expect(total).toBe(0);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('prend le snapshot du PLUS GROS npec, ni la premiere ligne ni la somme', async () => {
    const sb = makeSupabase([TEMPLATE_DEFAUT]);

    // Deux lignes, deux snapshots differents. Les trois lectures possibles
    // donnent trois resultats distincts, donc le test discrimine vraiment :
    //   premiere ligne  -> 5000 x 10 / 100 = 500
    //   somme des deux  -> (5000x10 + 8000x12) / 100 = 1460
    //   plus gros npec  -> 8000 x 12 / 100 = 960   <- attendu
    const lignes = [
      ligne({ npec_snapshot: 5_000, taux_commission_snapshot: 10 }),
      ligne({
        facture_id: 'f2',
        npec_snapshot: 8_000,
        taux_commission_snapshot: 12,
      }),
    ];

    // dureeMois large : les deux jalons comptent, sumQp = 1.
    const total = await loadTotalCommissionContrat(sb.client, null, lignes, 12);

    expect(total).toBe(960);
  });

  it("l'ordre des lignes ne change pas le resultat", async () => {
    const lignes = [
      ligne({ npec_snapshot: 5_000, taux_commission_snapshot: 10 }),
      ligne({
        facture_id: 'f2',
        npec_snapshot: 8_000,
        taux_commission_snapshot: 12,
      }),
    ];

    const direct = await loadTotalCommissionContrat(
      makeSupabase([TEMPLATE_DEFAUT]).client,
      null,
      lignes,
      12,
    );
    const inverse = await loadTotalCommissionContrat(
      makeSupabase([TEMPLATE_DEFAUT]).client,
      null,
      [...lignes].reverse(),
      12,
    );

    expect(inverse).toBe(direct);
  });

  it('exclut les jalons posterieurs a la duree du contrat', async () => {
    const sb = makeSupabase([TEMPLATE_DEFAUT]);

    // Contrat de 3 mois : seul le jalon a M0 (0,4) est atteint.
    const total = await loadTotalCommissionContrat(
      sb.client,
      null,
      [ligne({ npec_snapshot: 8_000, taux_commission_snapshot: 12 })],
      3,
    );

    expect(total).toBe(384); // 960 x 0,4
  });

  it("l'override du projet prime sur son template assigne", async () => {
    const sb = makeSupabase([
      TEMPLATE_DEFAUT,
      {
        id: 't-assigne',
        nom: 'Assigne',
        is_default: false,
        jalons: [{ mois_relatif: 0, quote_part: 0.5 }],
      },
    ]);

    const total = await loadTotalCommissionContrat(
      sb.client,
      {
        echeancier_template_id: 't-assigne',
        echeancier_override: [{ mois_relatif: 0, quote_part: 1 }],
      },
      [ligne({ npec_snapshot: 8_000, taux_commission_snapshot: 12 })],
      12,
    );

    // 960 (override, qp = 1) et non 480 (template assigne, qp = 0,5).
    expect(total).toBe(960);
  });

  it('sans configuration projet : retombe sur le template par defaut', async () => {
    const sb = makeSupabase([
      TEMPLATE_DEFAUT,
      {
        id: 't-autre',
        nom: 'Autre',
        is_default: false,
        jalons: [{ mois_relatif: 0, quote_part: 1 }],
      },
    ]);

    const total = await loadTotalCommissionContrat(
      sb.client,
      { echeancier_template_id: null, echeancier_override: null },
      [ligne({ npec_snapshot: 8_000, taux_commission_snapshot: 12 })],
      12,
    );

    expect(total).toBe(960); // template par defaut, sumQp = 0,4 + 0,6
  });

  it('aucun template exploitable : pas de jalon, donc pas de commission', async () => {
    const sb = makeSupabase([]);

    const total = await loadTotalCommissionContrat(
      sb.client,
      null,
      [ligne({ npec_snapshot: 8_000, taux_commission_snapshot: 12 })],
      12,
    );

    expect(total).toBe(0);
  });

  it('ne lit que les templates non archives', async () => {
    const sb = makeSupabase([TEMPLATE_DEFAUT]);

    await loadTotalCommissionContrat(sb.client, null, [ligne()], 12);

    expect(sb.from).toHaveBeenCalledWith('echeanciers_templates');
    expect(sb.eq).toHaveBeenCalledWith('archive', false);
  });
});
