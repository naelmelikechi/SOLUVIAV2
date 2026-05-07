'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/utils/audit';

// ---------------------------------------------------------------------------
// computeProrataAvoir — suggested avoir amount for a "Rupture anticipée" motif
// ---------------------------------------------------------------------------
// Spec 06: "Calcul automatique au pro-rata temporis : montant contrat × durée
// réalisée / durée totale." Applied per-ligne: the non-realised fraction of
// each contrat line is refunded. CDP can still override the suggestion.

export type ProrataBreakdownItem = {
  contratRef: string | null;
  apprenant: string;
  montantLigneHt: number;
  dureeRealiseeMois: number;
  dureeTotaleMois: number;
  avoirLigneHt: number;
};

export async function computeProrataAvoir(params: {
  factureOrigineId: string;
  dateRupture: string; // YYYY-MM-DD
}): Promise<{
  success: boolean;
  suggestedAmount?: number;
  breakdown?: ProrataBreakdownItem[];
  error?: string;
}> {
  const { factureOrigineId, dateRupture } = params;
  if (!dateRupture) return { success: false, error: 'Date de rupture requise' };

  const rupture = new Date(dateRupture);
  if (Number.isNaN(rupture.getTime())) {
    return { success: false, error: 'Date invalide' };
  }

  const supabase = await createClient();

  const { data: lignes, error } = await supabase
    .from('facture_lignes')
    .select(
      `
      montant_ht,
      contrat:contrats!facture_lignes_contrat_id_fkey(
        ref, apprenant_nom, apprenant_prenom, date_debut, duree_mois
      )
    `,
    )
    .eq('facture_id', factureOrigineId);

  if (error) return { success: false, error: error.message };
  if (!lignes || lignes.length === 0) {
    return { success: false, error: 'Aucune ligne sur cette facture' };
  }

  const breakdown: ProrataBreakdownItem[] = [];
  let total = 0;

  for (const ligne of lignes) {
    const c = ligne.contrat;
    const montantLigne = ligne.montant_ht ?? 0;
    const apprenant = [c?.apprenant_prenom, c?.apprenant_nom]
      .filter(Boolean)
      .join(' ')
      .trim();

    // Without dates we cannot compute pro-rata → treat as fully non-réalisé
    // so the CDP reviews it (worst case = full refund of that line).
    if (!c?.date_debut || !c?.duree_mois) {
      breakdown.push({
        contratRef: c?.ref ?? null,
        apprenant: apprenant || '-',
        montantLigneHt: montantLigne,
        dureeRealiseeMois: 0,
        dureeTotaleMois: 0,
        avoirLigneHt: montantLigne,
      });
      total += montantLigne;
      continue;
    }

    const debut = new Date(c.date_debut);
    const totalMs = rupture.getTime() - debut.getTime();
    const realiseeMois = Math.max(
      0,
      Math.min(c.duree_mois, totalMs / (1000 * 60 * 60 * 24 * 30.4375)),
    );
    const fractionNonRealisee = 1 - realiseeMois / c.duree_mois;
    const avoirLigne =
      Math.round(montantLigne * fractionNonRealisee * 100) / 100;

    breakdown.push({
      contratRef: c.ref ?? null,
      apprenant: apprenant || '-',
      montantLigneHt: montantLigne,
      dureeRealiseeMois: Math.round(realiseeMois * 10) / 10,
      dureeTotaleMois: c.duree_mois,
      avoirLigneHt: avoirLigne,
    });
    total += avoirLigne;
  }

  return {
    success: true,
    suggestedAmount: Math.round(total * 100) / 100,
    breakdown,
  };
}

export async function createAvoir(params: {
  factureOrigineId: string;
  motif: string;
  montant: number;
  note?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const { factureOrigineId, motif, montant, note } = params;

  if (!motif) return { success: false, error: 'Motif requis' };
  if (montant <= 0) return { success: false, error: 'Montant invalide' };

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // Fetch origin facture
  const { data: origine, error: origineError } = await supabase
    .from('factures')
    .select(
      'id, ref, projet_id, client_id, mois_concerne, montant_ht, taux_tva, statut, est_avoir',
    )
    .eq('id', factureOrigineId)
    .single();

  if (origineError || !origine) {
    return { success: false, error: 'Facture origine introuvable' };
  }

  if (origine.est_avoir) {
    return {
      success: false,
      error: 'Impossible de créer un avoir sur un avoir',
    };
  }

  if (origine.statut !== 'emise' && origine.statut !== 'en_retard') {
    return { success: false, error: 'La facture doit être émise ou en retard' };
  }

  if (montant > origine.montant_ht) {
    return {
      success: false,
      error:
        "Le montant de l'avoir ne peut pas dépasser le montant de la facture",
    };
  }

  // Check no existing avoir
  const { data: existingAvoir } = await supabase
    .from('factures')
    .select('id')
    .eq('est_avoir', true)
    .eq('facture_origine_id', factureOrigineId)
    .maybeSingle();

  if (existingAvoir) {
    return { success: false, error: 'Un avoir existe déjà sur cette facture' };
  }

  // Calculate amounts (negative)
  const montantHt = -Math.abs(montant);
  const montantTva = Math.round(montantHt * origine.taux_tva) / 100;
  const montantTtc = Math.round((montantHt + montantTva) * 100) / 100;

  // L'avoir est cree en BROUILLON (statut 'a_emettre' + est_avoir=true).
  // Le user doit le verifier puis l'envoyer via sendFacture, ce qui
  // transitionnera le statut vers 'avoir' et attribuera le ref final.
  const { data: avoir, error: insertError } = await supabase
    .from('factures')
    .insert({
      projet_id: origine.projet_id,
      client_id: origine.client_id,
      date_emission: new Date().toISOString().split('T')[0]!,
      date_echeance: new Date().toISOString().split('T')[0]!,
      mois_concerne: origine.mois_concerne,
      montant_ht: montantHt,
      taux_tva: origine.taux_tva,
      montant_tva: montantTva,
      montant_ttc: montantTtc,
      statut: 'a_emettre',
      est_avoir: true,
      avoir_motif: note ? `${motif} - ${note}` : motif,
      facture_origine_id: factureOrigineId,
      created_by: user.id,
    })
    .select('id, ref')
    .single();

  if (insertError || !avoir) {
    return {
      success: false,
      error: insertError?.message ?? 'Erreur de création',
    };
  }

  // Fetch first contrat_id from origin facture lignes (required by schema)
  const { data: origineLignes } = await supabase
    .from('facture_lignes')
    .select('contrat_id')
    .eq('facture_id', factureOrigineId)
    .limit(1)
    .maybeSingle();

  if (origineLignes?.contrat_id) {
    await supabase.from('facture_lignes').insert({
      facture_id: avoir.id,
      contrat_id: origineLignes.contrat_id,
      description: `Avoir sur ${origine.ref} - ${motif}`,
      montant_ht: montantHt,
    });
  }

  // Audit log : brouillon d'avoir cree, ref final attribue a l'envoi
  logAudit('brouillon_avoir_created', 'facture', avoir.id, {
    motif,
    montant: montantHt,
  });

  revalidatePath('/facturation');
  revalidatePath(`/facturation/${origine.ref}`);

  return { success: true, id: avoir.id };
}
