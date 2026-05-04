import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 120;

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();

  // Fetch active projets with active contrats
  const { data: projets, error: projetsError } = await supabase
    .from('projets')
    .select(
      `
      id, taux_commission,
      contrats(id, npec_amount, date_debut, duree_mois)
    `,
    )
    .eq('statut', 'actif')
    .eq('archive', false);

  if (projetsError) {
    return NextResponse.json({ error: projetsError.message }, { status: 500 });
  }

  const allEcheances: Array<{
    projet_id: string;
    mois_concerne: string;
    date_emission_prevue: string;
    montant_prevu_ht: number;
  }> = [];

  for (const projet of projets ?? []) {
    const contrats = projet.contrats ?? [];
    if (contrats.length === 0) continue;

    const tauxCommission = projet.taux_commission ?? 10;

    for (const contrat of contrats) {
      if (!contrat.date_debut || !contrat.duree_mois) continue;

      const startDate = new Date(contrat.date_debut);
      const dureeMois = contrat.duree_mois;
      const montantMensuel =
        Math.round(
          (((contrat.npec_amount ?? 0) * tauxCommission) / 100 / 12) * 100,
        ) / 100;

      // Generate echeances: M+2 through M+10, then M12 (covers M10-M12)
      for (let m = 2; m <= Math.min(dureeMois, 10); m++) {
        const echeanceDate = new Date(
          startDate.getFullYear(),
          startDate.getMonth() + m,
          1,
        );
        const moisStr = echeanceDate.toISOString().split('T')[0]!;

        const montant =
          m === 10 && dureeMois >= 12 ? montantMensuel * 3 : montantMensuel;

        allEcheances.push({
          projet_id: projet.id,
          mois_concerne: moisStr,
          date_emission_prevue: new Date(
            echeanceDate.getFullYear(),
            echeanceDate.getMonth(),
            25,
          )
            .toISOString()
            .split('T')[0]!,
          montant_prevu_ht: montant,
        });
      }
    }
  }

  // Pass 1 : INSERT les echeances qui n'existent pas encore (ignoreDuplicates).
  // Pass 2 : UPDATE le montant_prevu_ht et date_emission_prevue des echeances
  // existantes NON FACTUREES (facture_id IS NULL). Necessaire car npec_amount
  // peut etre rempli apres coup (ex: migration data Eduvia) - sans cela, les
  // echeances generees a 0 € restent figees a 0 indefiniment.
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
    if (!insertErr) inserted = count ?? 0;

    // Refresh montants on existing non-billed echeances. Une echeance liee a
    // une facture (facture_id NOT NULL) est figee : on ne touche pas son
    // montant car la facture a ete emise sur cette base.
    for (const ech of allEcheances) {
      const { error: updErr, count: updCount } = await supabase
        .from('echeances')
        .update(
          {
            montant_prevu_ht: ech.montant_prevu_ht,
            date_emission_prevue: ech.date_emission_prevue,
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
