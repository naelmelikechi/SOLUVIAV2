'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

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
