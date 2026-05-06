import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  aggregateProjetEcheances,
  parseJalons,
  resolveProjetEcheancier,
  type ContratEcheancierContext,
} from '@/lib/echeancier/calc';
import { logger } from '@/lib/utils/logger';

export const maxDuration = 120;

const SCOPE = 'cron.echeances';

/**
 * Cron mensuel (1er a 2h) : genere les echeances projet/mois selon
 * l'echeancier resolu de chaque projet (override > template > default).
 *
 * Strategie d'idempotence :
 * - Pass 1 : INSERT les nouvelles echeances (ignoreDuplicates sur
 *   projet_id+mois_concerne).
 * - Pass 2 : UPDATE le montant_prevu_ht des echeances existantes NON
 *   FACTUREES (facture_id IS NULL) - permet de rattraper un changement
 *   de NPEC ou de configuration de l'echeancier.
 *
 * Echeances facturees (facture_id NOT NULL) ne sont jamais modifiees.
 */
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();

  // 1. Charge tous les templates en une fois (referentiel, peu nombreux)
  const { data: templates, error: tplError } = await supabase
    .from('echeanciers_templates')
    .select('id, nom, jalons, is_default')
    .eq('archive', false);
  if (tplError) {
    logger.error(SCOPE, 'fetch templates failed', { error: tplError });
    return NextResponse.json({ error: tplError.message }, { status: 500 });
  }

  // 2. Charge les projets actifs avec contrats + config echeancier
  // Filtre clients reels uniquement (pas demo, pas archive)
  const { data: projets, error: projetsError } = await supabase
    .from('projets')
    .select(
      `
      id, taux_commission, echeancier_template_id, echeancier_override,
      contrats(id, npec_amount, date_debut, duree_mois, archive),
      client:clients!projets_client_id_fkey!inner(is_demo, archive)
    `,
    )
    .eq('statut', 'actif')
    .eq('archive', false)
    .eq('client.is_demo', false)
    .eq('client.archive', false);

  if (projetsError) {
    logger.error(SCOPE, 'fetch projets failed', { error: projetsError });
    return NextResponse.json({ error: projetsError.message }, { status: 500 });
  }

  // 3. Pour chaque projet, resout son echeancier et aggrege les echeances
  const allEcheances: Array<{
    projet_id: string;
    mois_concerne: string;
    date_emission_prevue: string;
    montant_prevu_ht: number;
    mois_relatif: number | null;
    quote_part: number | null;
    npec_snapshot: number;
  }> = [];

  for (const projet of projets ?? []) {
    const contratsRaw = projet.contrats ?? [];
    if (contratsRaw.length === 0) continue;

    const contrats: ContratEcheancierContext[] = contratsRaw
      .filter((c) => c.date_debut && c.duree_mois)
      .map((c) => ({
        contrat_id: c.id,
        npec_amount: c.npec_amount ?? 0,
        date_debut: c.date_debut!,
        duree_mois: c.duree_mois!,
        archive: c.archive ?? false,
      }));
    if (contrats.length === 0) continue;

    const resolved = resolveProjetEcheancier(
      {
        echeancier_override: projet.echeancier_override,
        echeancier_template_id: projet.echeancier_template_id,
      },
      (templates ?? []).map((t) => ({
        id: t.id,
        nom: t.nom,
        jalons: t.jalons,
        is_default: t.is_default,
      })),
    );
    if (resolved.jalons.length === 0) continue;

    const jalons = parseJalons(resolved.jalons);
    const tauxCommission = projet.taux_commission ?? 10;
    const echeances = aggregateProjetEcheances(
      projet.id,
      contrats,
      jalons,
      tauxCommission,
    );

    for (const e of echeances) {
      // Le mois_relatif/quote_part/npec_snapshot d'une echeance projet
      // n'est exact que si tous les contrats contributeurs sont sur le
      // meme jalon. On stocke les valeurs du 1er contributeur a titre
      // indicatif (audit), mais le vrai detail est dans facture_lignes.
      const first = e.contributions[0];
      const npecSum = e.contributions.reduce((s, c) => s + c.npec_snapshot, 0);
      allEcheances.push({
        projet_id: e.projet_id,
        mois_concerne: e.mois_concerne,
        date_emission_prevue: e.date_emission_prevue,
        montant_prevu_ht: e.montant_prevu_ht,
        mois_relatif: first?.mois_relatif ?? null,
        quote_part: first?.quote_part ?? null,
        npec_snapshot: npecSum,
      });
    }
  }

  // 4. Pass 1 : INSERT new (ignoreDuplicates)
  let inserted = 0;
  let updated = 0;
  if (allEcheances.length > 0) {
    const { error: insertErr, count } = await supabase
      .from('echeances')
      .upsert(allEcheances, {
        onConflict: 'projet_id,mois_concerne',
        ignoreDuplicates: true,
        count: 'exact',
      });
    if (insertErr) {
      logger.error(SCOPE, 'insert failed', { error: insertErr });
    } else {
      inserted = count ?? 0;
    }

    // Pass 2 : UPDATE montants et tracabilite des echeances non facturees
    for (const ech of allEcheances) {
      const { error: updErr, count: updCount } = await supabase
        .from('echeances')
        .update(
          {
            montant_prevu_ht: ech.montant_prevu_ht,
            date_emission_prevue: ech.date_emission_prevue,
            mois_relatif: ech.mois_relatif,
            quote_part: ech.quote_part,
            npec_snapshot: ech.npec_snapshot,
          },
          { count: 'exact' },
        )
        .eq('projet_id', ech.projet_id)
        .eq('mois_concerne', ech.mois_concerne)
        .is('facture_id', null);
      if (!updErr && updCount) updated += updCount;
    }
  }

  return NextResponse.json({
    success: true,
    echeances_created: inserted,
    echeances_refreshed: updated,
  });
}
