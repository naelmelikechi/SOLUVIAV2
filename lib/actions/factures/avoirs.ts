'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { checkAuth } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/utils/audit';
import { getDefaultSocieteEmettriceId } from '@/lib/queries/societes-emettrices';
import { computeProrataRupture } from '@/lib/echeancier/calc';
import { loadBilledLines } from '@/lib/echeancier/ajustements';
import { loadTotalCommissionContrat } from '@/lib/echeancier/commission-contrat';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ComputeProrataAvoirSchema = z.object({
  factureOrigineId: z.string().uuid('factureOrigineId doit être un UUID'),
  dateRupture: z
    .string()
    .regex(ISO_DATE_RE, 'Date au format YYYY-MM-DD requise'),
});

const CreateAvoirSchema = z.object({
  factureOrigineId: z.string().uuid('factureOrigineId doit être un UUID'),
  motif: z.string().min(1, 'Motif requis').max(200, 'Motif trop long'),
  montant: z
    .number()
    .finite('Montant doit être un nombre fini')
    .positive('Montant doit etre strictement positif')
    .max(10_000_000, 'Montant aberrant'),
  note: z.string().max(2000).optional(),
  // contratId : ajoute au #6 pour lier explicitement l avoir a un contrat
  contratId: z.string().uuid('contratId doit être un UUID').optional(),
});

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
  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = ComputeProrataAvoirSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  const { factureOrigineId, dateRupture } = parsed.data;

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
      contrat_id,
      contrat:contrats!facture_lignes_contrat_id_fkey(
        ref, apprenant_nom, apprenant_prenom, date_debut, duree_mois,
        projets!inner(echeancier_template_id, echeancier_override)
      )
    `,
    )
    .eq('facture_id', factureOrigineId);

  if (error) return { success: false, error: error.message };
  if (!lignes || lignes.length === 0) {
    return { success: false, error: 'Aucune ligne sur cette facture' };
  }

  // Un avoir de rupture se raisonne par CONTRAT, pas par ligne : c'est
  // l'echeancier du contrat qui dit ce qui est gagne a la date de rupture. On
  // regroupe donc les lignes de la facture origine par contrat, et on delegue le
  // calcul a computeProrataRupture, le MEME que le pipeline d'ajustements.
  //
  // Avant, cette fonction appliquait un prorata lineaire de 30,4375 jours par
  // mois, ligne par ligne. Sur un echeancier front-load (ex. 3/12 au M+3) elle
  // sur-remboursait : sur un contrat de 12 mois a 12 000 de NPEC et 10 % de taux,
  // avec seul le jalon M+3 facture (300 HT) et une rupture a 6 mois, elle
  // proposait 151,33 EUR alors que SOLUVIA est CREDITEUR de 300 (gagne 600 pour
  // 300 factures) et ne doit rien rembourser. Le pipeline, lui, rendait 0,00.
  // Le montant etant pre-rempli dans le champ d'avoir et aucun garde-fou ne
  // portant sur sa justesse, l'ecart partait tel quel a la validation.
  const parContrat = new Map<
    string,
    {
      ref: string | null;
      apprenant: string;
      dateDebut: string | null;
      dureeMois: number | null;
      projetConfig: {
        echeancier_template_id: string | null;
        echeancier_override: unknown;
      } | null;
      montantFactureHt: number;
    }
  >();

  for (const ligne of lignes) {
    const c = ligne.contrat;
    const contratId = ligne.contrat_id;
    if (!contratId) continue;
    const projets = c?.projets as {
      echeancier_template_id: string | null;
      echeancier_override: unknown;
    } | null;
    const existant = parContrat.get(contratId);
    if (existant) {
      existant.montantFactureHt += ligne.montant_ht ?? 0;
      continue;
    }
    parContrat.set(contratId, {
      ref: c?.ref ?? null,
      apprenant:
        [c?.apprenant_prenom, c?.apprenant_nom]
          .filter(Boolean)
          .join(' ')
          .trim() || '-',
      dateDebut: c?.date_debut ?? null,
      dureeMois: c?.duree_mois ?? null,
      projetConfig: projets,
      montantFactureHt: ligne.montant_ht ?? 0,
    });
  }

  const breakdown: ProrataBreakdownItem[] = [];
  let total = 0;

  for (const [contratId, info] of parContrat) {
    // Sans dates, aucun prorata n'est calculable : on propose le remboursement
    // integral pour que le CDP arbitre, comme avant.
    if (!info.dateDebut || !info.dureeMois) {
      breakdown.push({
        contratRef: info.ref,
        apprenant: info.apprenant,
        montantLigneHt: info.montantFactureHt,
        dureeRealiseeMois: 0,
        dureeTotaleMois: 0,
        avoirLigneHt: info.montantFactureHt,
      });
      total += info.montantFactureHt;
      continue;
    }

    const billedLines = await loadBilledLines(supabase, contratId);
    const totalCommissionContrat = await loadTotalCommissionContrat(
      supabase,
      info.projetConfig,
      billedLines,
      info.dureeMois,
    );
    const result = computeProrataRupture(
      { date_debut: info.dateDebut, duree_mois: info.dureeMois },
      dateRupture,
      billedLines,
      totalCommissionContrat,
    );

    const realiseeMois = Math.max(
      0,
      Math.min(
        info.dureeMois,
        (rupture.getTime() - new Date(info.dateDebut).getTime()) /
          (1000 * 60 * 60 * 24 * 30.4375),
      ),
    );

    breakdown.push({
      contratRef: info.ref,
      apprenant: info.apprenant,
      montantLigneHt: info.montantFactureHt,
      dureeRealiseeMois: Math.round(realiseeMois * 10) / 10,
      dureeTotaleMois: info.dureeMois,
      avoirLigneHt: result.avoir_total_ht,
    });
    total += result.avoir_total_ht;
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
  contratId?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const parsed = CreateAvoirSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  const { factureOrigineId, motif, montant, note } = parsed.data;

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // Fetch origin facture
  const { data: origine, error: origineError } = await supabase
    .from('factures')
    .select(
      'id, ref, projet_id, client_id, mois_concerne, montant_ht, taux_tva, statut, est_avoir, societe_emettrice_id',
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

  // ---------------------------------------------------------------------
  // Selection du contrat lie a l avoir (#6).
  // ---------------------------------------------------------------------
  // Spec metier confirmee : un avoir = lie a UN contrat (typiquement
  // rupture anticipee, fin avant terme, etc). Avant le fix on prenait
  // arbitrairement le PREMIER contrat des lignes origine, ce qui rendait
  // l avoir comptablement faux quand la facture origine couvrait N contrats.
  //
  // Resolution :
  // - Si la facture origine a 1 seul contrat distinct : auto-deduit
  // - Sinon : contratId requis, et doit appartenir aux lignes origine
  const { data: origineLignesAll } = await supabase
    .from('facture_lignes')
    .select(
      `contrat_id, contrat:contrats!facture_lignes_contrat_id_fkey(ref, apprenant_nom, apprenant_prenom)`,
    )
    .eq('facture_id', factureOrigineId);

  const origineContratIds = Array.from(
    new Set(
      (origineLignesAll ?? []).flatMap((l) =>
        l.contrat_id ? [l.contrat_id] : [],
      ),
    ),
  ) as string[];

  if (origineContratIds.length === 0) {
    return {
      success: false,
      error:
        "Facture origine sans ligne attachee a un contrat - impossible d'emettre l avoir.",
    };
  }

  let resolvedContratId: string;
  if (parsed.data.contratId) {
    if (!origineContratIds.includes(parsed.data.contratId)) {
      return {
        success: false,
        error: "Le contrat sélectionné n'appartient pas à la facture origine.",
      };
    }
    resolvedContratId = parsed.data.contratId;
  } else if (origineContratIds.length === 1) {
    resolvedContratId = origineContratIds[0]!;
  } else {
    return {
      success: false,
      error: `La facture origine couvre ${origineContratIds.length} contrats. Sélectionnez celui concerné par l'avoir.`,
    };
  }

  // Pour l audit + la description : retrouve l info apprenant du contrat resolu.
  const ligneContrat = (origineLignesAll ?? []).find(
    (l) => l.contrat_id === resolvedContratId,
  )?.contrat;
  const apprenant = [
    ligneContrat?.apprenant_prenom,
    ligneContrat?.apprenant_nom,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  const contratLabel = ligneContrat?.ref
    ? `${ligneContrat.ref}${apprenant ? ` (${apprenant})` : ''}`
    : apprenant || 'contrat';

  // Calculate amounts (negative)
  const montantHt = -Math.abs(montant);
  const montantTva = Math.round(montantHt * origine.taux_tva) / 100;
  const montantTtc = Math.round((montantHt + montantTva) * 100) / 100;

  // L'avoir est cree en BROUILLON (statut 'a_emettre' + est_avoir=true).
  // Le user doit le verifier puis l'envoyer via sendFacture, ce qui
  // transitionnera le statut vers 'avoir' et attribuera le ref final.
  // Societe emettrice : celle de la facture d'origine (un avoir DIGIVIA ne
  // doit pas sortir au nom de SOLUVIA) ; fallback defaut pour l'historique.
  const societeEmettriceId =
    origine.societe_emettrice_id ?? (await getDefaultSocieteEmettriceId());
  const { data: avoir, error: insertError } = await supabase
    .from('factures')
    .insert({
      societe_emettrice_id: societeEmettriceId,
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

  // Insere une ligne d avoir lie au contrat resolu (vs ancien code qui
  // prenait arbitrairement le premier ligne -> bug comptable).
  const { error: ligneError } = await supabase.from('facture_lignes').insert({
    facture_id: avoir.id,
    contrat_id: resolvedContratId,
    description: `Avoir sur ${origine.ref} - ${motif} - ${contratLabel}`,
    montant_ht: montantHt,
  });

  if (ligneError) {
    // Rollback : un avoir sans ligne est mal forme. On supprime puisqu il
    // est encore en statut 'a_emettre' (pas de numero_seq consomme).
    await supabase.from('factures').delete().eq('id', avoir.id);
    return { success: false, error: ligneError.message };
  }

  // Audit log : brouillon d'avoir cree, ref final attribue a l'envoi
  logAudit(
    'brouillon_avoir_created',
    'facture',
    avoir.id,
    {
      motif,
      montant: montantHt,
      contratId: resolvedContratId,
    },
    user.id,
  );

  revalidatePath('/facturation');
  revalidatePath(`/facturation/${origine.ref}`);

  return { success: true, id: avoir.id };
}
