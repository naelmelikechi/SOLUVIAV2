import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEmetteurInfo } from '@/lib/queries/parametres';
import { lastDayOfNextMonthUtcISO } from '@/lib/utils/dates';

export const maxDuration = 60;

/**
 * Donnees brutes (JSON) pour l'apercu HTML d'une echeance brouillon.
 * Beaucoup plus rapide que le rendu PDF (~5KB JSON vs ~30KB PDF + 1-3s
 * de rendu @react-pdf/renderer). Le client refait la mise en page en
 * HTML/Tailwind.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  // echeance + emetteur en parallele. Voir commentaire dans pdf-preview.
  const [echeanceRes, emetteur] = await Promise.all([
    supabase
      .from('echeances')
      .select(
        `
        id, mois_concerne, date_emission_prevue, montant_prevu_ht,
        projet:projets!echeances_projet_id_fkey(
          id, ref, taux_commission,
          client:clients!projets_client_id_fkey(id, trigramme, raison_sociale, siret, adresse, localisation, tva_intracommunautaire)
        )
      `,
      )
      .eq('id', id)
      .single(),
    getEmetteurInfo(),
  ]);

  const { data: echeance, error } = echeanceRes;
  if (error || !echeance) {
    return NextResponse.json(
      { error: 'Échéance introuvable' },
      { status: 404 },
    );
  }

  const projet = echeance.projet;
  if (!projet) {
    return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 });
  }

  const { data: contrats } = await supabase
    .from('contrats')
    .select(
      'id, ref, npec_amount, formation_titre, apprenant_prenom, apprenant_nom',
    )
    .eq('projet_id', projet.id)
    .eq('archive', false);

  const tauxCommission = projet.taux_commission ?? 10;

  // Meme math que createFactures dans lib/actions/factures.ts
  const lignes = (contrats ?? []).map((c, idx) => {
    const montantHt =
      Math.round((((c.npec_amount ?? 0) * tauxCommission) / 100 / 12) * 100) /
      100;
    return {
      id: `draft-line-${idx}`,
      contrat_ref: c.ref ?? '',
      apprenant_prenom: c.apprenant_prenom ?? null,
      apprenant_nom: c.apprenant_nom ?? null,
      description: `Commission ${tauxCommission}% - ${c.formation_titre ?? ''} - ${c.apprenant_prenom ?? ''} ${c.apprenant_nom ?? ''} - ${echeance.mois_concerne}`,
      montant_ht: montantHt,
    };
  });

  const totalHt =
    Math.round(lignes.reduce((s, l) => s + l.montant_ht, 0) * 100) / 100;
  const tauxTva = 20;
  const montantTva = Math.round(totalHt * tauxTva) / 100;
  const montantTtc = Math.round((totalHt + montantTva) * 100) / 100;

  const today = new Date();
  const dateEmission = today.toISOString().split('T')[0]!;
  const dateEcheance = lastDayOfNextMonthUtcISO(today);

  return NextResponse.json(
    {
      ref: 'APERÇU',
      date_emission: dateEmission,
      date_echeance: dateEcheance,
      mois_concerne: echeance.mois_concerne,
      montant_ht: totalHt,
      taux_tva: tauxTva,
      montant_tva: montantTva,
      montant_ttc: montantTtc,
      projet: { ref: projet.ref ?? '' },
      client: projet.client
        ? {
            raison_sociale: projet.client.raison_sociale ?? '',
            siret: projet.client.siret ?? null,
            adresse: projet.client.adresse ?? null,
            localisation: projet.client.localisation ?? null,
            tva_intracommunautaire:
              projet.client.tva_intracommunautaire ?? null,
          }
        : null,
      lignes,
      emetteur,
    },
    {
      headers: {
        // Donnees sensibles (SIRET, montants, apprenants) : pas de cache partage.
        'Cache-Control': 'private, no-store, max-age=0',
      },
    },
  );
}
