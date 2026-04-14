'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { sendEmailForFacture } from '@/lib/email/client';

export async function createFactures(
  echeanceIds: string[],
): Promise<{ success: boolean; refs: string[]; error?: string }> {
  if (echeanceIds.length === 0) {
    return { success: false, refs: [], error: 'Aucune échéance sélectionnée' };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, refs: [], error: 'Non authentifié' };

  // 1. Fetch selected echeances with projet + client
  const { data: echeances, error: fetchError } = await supabase
    .from('echeances')
    .select(
      `
      id, mois_concerne, montant_prevu_ht,
      projet:projets!echeances_projet_id_fkey(
        id, ref, taux_commission,
        client:clients!projets_client_id_fkey(id, trigramme)
      )
    `,
    )
    .in('id', echeanceIds)
    .is('facture_id', null);

  if (fetchError)
    return { success: false, refs: [], error: fetchError.message };
  if (!echeances || echeances.length === 0) {
    return {
      success: false,
      refs: [],
      error: 'Échéances introuvables ou déjà facturées',
    };
  }

  // 2. Group echeances by projet_id
  const groups = new Map<
    string,
    {
      projetId: string;
      clientId: string;
      tauxCommission: number;
      moisConcernes: string[];
      echeanceIds: string[];
    }
  >();

  for (const ech of echeances) {
    const projet = ech.projet;
    if (!projet) continue;
    const projetId = projet.id;
    const existing = groups.get(projetId);
    if (existing) {
      existing.moisConcernes.push(ech.mois_concerne);
      existing.echeanceIds.push(ech.id);
    } else {
      groups.set(projetId, {
        projetId,
        clientId: projet.client?.id ?? '',
        tauxCommission: projet.taux_commission ?? 10,
        moisConcernes: [ech.mois_concerne],
        echeanceIds: [ech.id],
      });
    }
  }

  // 3. For each group, create facture + lignes
  const createdRefs: string[] = [];

  for (const group of groups.values()) {
    // Fetch active contrats for this projet
    const { data: contrats } = await supabase
      .from('contrats')
      .select(
        'id, montant_prise_en_charge, formation_titre, apprenant_prenom, apprenant_nom',
      )
      .eq('projet_id', group.projetId)
      .eq('archive', false);

    if (!contrats || contrats.length === 0) continue;

    // Build mois_concerne label
    const moisLabel =
      group.moisConcernes.length === 1
        ? group.moisConcernes[0]!
        : `${group.moisConcernes[0]} - ${group.moisConcernes[group.moisConcernes.length - 1]}`;

    // Calculate line items
    const lignes = contrats.map((c) => {
      const montantHt =
        Math.round(
          (((c.montant_prise_en_charge ?? 0) * group.tauxCommission) /
            100 /
            12) *
            100,
        ) / 100;
      return {
        contrat_id: c.id,
        description: `Commission ${group.tauxCommission}% — ${c.formation_titre ?? ''} — ${c.apprenant_prenom ?? ''} ${c.apprenant_nom ?? ''} — ${moisLabel}`,
        montant_ht: montantHt,
      };
    });

    const totalHt =
      Math.round(lignes.reduce((s, l) => s + l.montant_ht, 0) * 100) / 100;
    const tauxTva = 20;
    const montantTva = Math.round(totalHt * tauxTva) / 100;
    const montantTtc = Math.round((totalHt + montantTva) * 100) / 100;

    // Date echeance = end of next month
    const today = new Date();
    const dateEcheance = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    const dateEcheanceStr = dateEcheance.toISOString().split('T')[0]!;

    // INSERT facture (trigger generates ref + numero_seq)
    const { data: facture, error: insertError } = await supabase
      .from('factures')
      .insert({
        projet_id: group.projetId,
        client_id: group.clientId,
        date_emission: new Date().toISOString().split('T')[0]!,
        date_echeance: dateEcheanceStr,
        mois_concerne: moisLabel,
        montant_ht: totalHt,
        taux_tva: tauxTva,
        montant_tva: montantTva,
        montant_ttc: montantTtc,
        statut: 'emise',
        est_avoir: false,
        created_by: user.id,
      })
      .select('id, ref')
      .single();

    if (insertError || !facture) continue;

    // INSERT facture_lignes
    await supabase.from('facture_lignes').insert(
      lignes.map((l) => ({
        facture_id: facture.id,
        contrat_id: l.contrat_id,
        description: l.description,
        montant_ht: l.montant_ht,
      })),
    );

    // UPDATE echeances to link
    await supabase
      .from('echeances')
      .update({ facture_id: facture.id, validee: true })
      .in('id', group.echeanceIds);

    createdRefs.push(facture.ref ?? '');

    // Send email (fire-and-forget, don't block facture creation)
    sendEmailForFacture(facture.id, supabase).catch(() => {
      // Email failure doesn't block facture creation
    });
  }

  revalidatePath('/facturation');

  if (createdRefs.length === 0) {
    return {
      success: false,
      refs: [],
      error: 'Aucune facture créée — vérifiez les contrats actifs',
    };
  }

  return { success: true, refs: createdRefs };
}

export async function createAvoir(params: {
  factureOrigineId: string;
  motif: string;
  montant: number;
  note?: string;
}): Promise<{ success: boolean; ref?: string; error?: string }> {
  const { factureOrigineId, motif, montant, note } = params;

  if (!motif) return { success: false, error: 'Motif requis' };
  if (montant <= 0) return { success: false, error: 'Montant invalide' };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifié' };

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
      statut: 'avoir',
      est_avoir: true,
      avoir_motif: note ? `${motif} — ${note}` : motif,
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
      description: `Avoir sur ${origine.ref} — ${motif}`,
      montant_ht: montantHt,
    });
  }

  revalidatePath('/facturation');
  revalidatePath(`/facturation/${origine.ref}`);

  return { success: true, ref: avoir.ref ?? undefined };
}
