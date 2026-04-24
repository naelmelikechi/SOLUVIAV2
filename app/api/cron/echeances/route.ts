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
      contrats(id, montant_prise_en_charge, date_debut, duree_mois)
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
          (((contrat.montant_prise_en_charge ?? 0) * tauxCommission) /
            100 /
            12) *
            100,
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

  // Single batch upsert instead of N+1 individual calls
  let created = 0;
  if (allEcheances.length > 0) {
    const { error } = await supabase.from('echeances').upsert(allEcheances, {
      onConflict: 'projet_id,mois_concerne',
      ignoreDuplicates: true,
    });

    if (!error) created = allEcheances.length;
  }

  return NextResponse.json({ success: true, echeances_created: created });
}
