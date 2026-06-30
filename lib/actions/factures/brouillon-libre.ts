'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { checkAuth } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import { addDaysIso } from '@/lib/utils/dates';
import { getDelaiEcheanceJours } from '@/lib/queries/parametres';
import { getDefaultSocieteEmettriceId } from '@/lib/queries/societes-emettrices';
import { resolveTvaRegime } from '@/lib/utils/tva-intracom';
import {
  uuidSchema,
  montantHtSchema,
  type SupabaseServerClient,
} from '@/lib/actions/factures/brouillons-shared';
import { getOrCreateProjetLibre } from '@/lib/projets/projet-libre';

const BlankBrouillonLigneSchema = z.object({
  contratId: uuidSchema('contratId'),
  description: z.string().trim().min(1, 'Description requise').max(2000),
  montantHt: montantHtSchema,
  moisRelatif: z.number().int().gte(-120).lte(120).optional(),
  quotePart: z.number().finite().gte(0).lte(1).optional(),
  npecSnapshot: z.number().finite().gte(0).lte(10_000_000).optional(),
  tauxCommissionSnapshot: z.number().finite().gte(0).lte(100).optional(),
});

const CreateBlankBrouillonSchema = z.object({
  projetId: uuidSchema('projetId'),
  lignes: z
    .array(BlankBrouillonLigneSchema)
    .min(1, 'Au moins une ligne requise')
    .max(500, 'Trop de lignes'),
});

// Facture libre : rattachee au projet libre systeme du client (pas de projet
// metier ni de contrats). Chaque ligne est juste une description + montant HT,
// et la TVA est calculee a 20% sur le total. Admin only - les CDPs ne peuvent
// ni en creer ni en voir : le projet libre a cdp_id/backup_cdp_id NULL, donc
// l'EXISTS-subquery de la RLS CDP est vide pour eux.
const FreeLigneSchema = z.object({
  description: z.string().trim().min(1, 'Description requise').max(2000),
  montantHt: montantHtSchema,
});

const CreateFreeBrouillonSchema = z.object({
  clientId: uuidSchema('clientId'),
  societeEmettriceId: uuidSchema('societeEmettriceId').optional(),
  lignes: z
    .array(FreeLigneSchema)
    .min(1, 'Au moins une ligne requise')
    .max(500, 'Trop de lignes'),
});

// ---------------------------------------------------------------------------
// Helper interne : insert brouillon facture + lignes
// ---------------------------------------------------------------------------
// Partage la mecanique commune entre createBlankBrouillon (facture rattachee
// projet) et createFreeBrouillon (facture libre, rattachee au projet libre du
// client). Calcule la
// TVA 20% en cents entiers pour preserver l'invariant
// SUM(facture_lignes.montant_ht) == factures.montant_ht et rollback la
// facture si l'insert des lignes echoue (autorise tant que statut='a_emettre'
// car aucun numero gapless n'est consomme). Caller responsable de
// l'audit et des revalidatePath.

interface BrouillonLigneInsert {
  contrat_id: string | null;
  description: string;
  montant_ht: number;
  mois_relatif: number;
  quote_part: number;
  npec_snapshot: number;
  taux_commission_snapshot: number;
}

async function insertBrouillonWithLignes(args: {
  supabase: SupabaseServerClient;
  userId: string;
  projetId: string | null;
  clientId: string;
  lignes: BrouillonLigneInsert[];
  logScope: string;
  societeEmettriceId?: string;
}): Promise<
  | { ok: true; factureId: string; totalHt: number }
  | { ok: false; error: string }
> {
  const { supabase, userId, projetId, clientId, lignes, logScope } = args;
  const societeEmettriceIdFinal =
    args.societeEmettriceId ?? (await getDefaultSocieteEmettriceId());

  const totalHtCents = lignes.reduce(
    (s, l) => s + Math.round(l.montant_ht * 100),
    0,
  );
  if (totalHtCents <= 0) {
    return { ok: false, error: 'Montant total nul ou négatif' };
  }

  // TVA : 0% si client UE non-FR (autoliquidation), sinon 20%.
  const { data: clientTva } = await supabase
    .from('clients')
    .select('tva_intracommunautaire')
    .eq('id', clientId)
    .single();
  const tauxTva = resolveTvaRegime(clientTva?.tva_intracommunautaire).taux;
  const montantTvaCents = Math.round((totalHtCents * tauxTva) / 100);
  const totalHt = totalHtCents / 100;
  const montantTva = montantTvaCents / 100;
  const montantTtc = (totalHtCents + montantTvaCents) / 100;

  const today = new Date();
  const dateEmissionStr = today.toISOString().split('T')[0]!;
  const delaiJours = await getDelaiEcheanceJours(supabase);
  const dateEcheanceStr = addDaysIso(dateEmissionStr, delaiJours);

  const { data: facture, error: insertError } = await supabase
    .from('factures')
    .insert({
      societe_emettrice_id: societeEmettriceIdFinal,
      projet_id: projetId,
      client_id: clientId,
      date_emission: dateEmissionStr,
      date_echeance: dateEcheanceStr,
      mois_concerne: today.toISOString().slice(0, 7),
      montant_ht: totalHt,
      taux_tva: tauxTva,
      montant_tva: montantTva,
      montant_ttc: montantTtc,
      statut: 'a_emettre',
      est_avoir: false,
      created_by: userId,
    })
    .select('id')
    .single();

  if (insertError || !facture) {
    logger.error('actions.factures', `${logScope} insert failed`, {
      error: insertError,
      clientId,
      projetId,
    });
    return {
      ok: false,
      error: insertError?.message ?? 'Échec de la création du brouillon',
    };
  }

  const { error: lignesError } = await supabase
    .from('facture_lignes')
    .insert(lignes.map((l) => ({ ...l, facture_id: facture.id })));

  if (lignesError) {
    await supabase.from('factures').delete().eq('id', facture.id);
    logger.error('actions.factures', `${logScope} lignes failed`, {
      factureId: facture.id,
      error: lignesError,
    });
    return { ok: false, error: lignesError.message };
  }

  return { ok: true, factureId: facture.id, totalHt };
}

// ---------------------------------------------------------------------------
// createBlankBrouillon - cree un brouillon "from scratch" : l'utilisateur
// choisit un projet et N contrats (avec montant + description par contrat).
// Aucun lien echeance ni event - facture purement libre, editable ensuite.
// ---------------------------------------------------------------------------
export interface BlankBrouillonLigne {
  contratId: string;
  description: string;
  montantHt: number;
  moisRelatif?: number;
  quotePart?: number;
  npecSnapshot?: number;
  tauxCommissionSnapshot?: number;
}

export async function createBlankBrouillon(params: {
  projetId: string;
  lignes: BlankBrouillonLigne[];
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const parsed = CreateBlankBrouillonSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  const { projetId, lignes } = parsed.data;

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { data: projet } = await supabase
    .from('projets')
    .select('id, ref, client_id, taux_commission')
    .eq('id', projetId)
    .single();
  if (!projet) return { success: false, error: 'Projet introuvable' };

  // Verifie les contrats : tous doivent appartenir au projet
  const contratIds = Array.from(new Set(lignes.map((l) => l.contratId)));
  const { data: contrats } = await supabase
    .from('contrats')
    .select('id, projet_id')
    .in('id', contratIds);
  const invalid = (contrats ?? []).filter((c) => c.projet_id !== projetId);
  if (invalid.length > 0 || (contrats ?? []).length !== contratIds.length) {
    return {
      success: false,
      error: 'Certains contrats ne correspondent pas au projet sélectionné.',
    };
  }

  const tauxProjet = Number(projet.taux_commission ?? 10);
  const result = await insertBrouillonWithLignes({
    supabase,
    userId: user.id,
    projetId,
    clientId: projet.client_id,
    lignes: lignes.map((l) => ({
      contrat_id: l.contratId,
      description: l.description,
      montant_ht: l.montantHt,
      mois_relatif: l.moisRelatif ?? 0,
      quote_part: l.quotePart ?? 0,
      npec_snapshot: l.npecSnapshot ?? 0,
      taux_commission_snapshot: l.tauxCommissionSnapshot ?? tauxProjet,
    })),
    logScope: 'createBlankBrouillon',
  });

  if (!result.ok) return { success: false, error: result.error };

  logAudit(
    'blank_brouillon_created',
    'facture',
    result.factureId,
    {
      projetId,
      lignesCount: lignes.length,
      montantHt: result.totalHt,
    },
    user.id,
  );

  revalidatePath('/facturation');
  revalidatePath(`/projets/${projet.ref}`);

  return { success: true, id: result.factureId };
}

// ---------------------------------------------------------------------------
// createFreeBrouillon - facture libre (prestations one-shot, conseil, audit...)
// rattachee au projet libre du client (pas de projet metier ni de contrats).
// Admin/superadmin only.
// ---------------------------------------------------------------------------
export interface FreeLigne {
  description: string;
  montantHt: number;
}

export async function createFreeBrouillon(params: {
  clientId: string;
  societeEmettriceId?: string;
  lignes: FreeLigne[];
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const parsed = CreateFreeBrouillonSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  const { clientId, societeEmettriceId, lignes } = parsed.data;

  // Admin only : la facture libre est rattachee au projet libre du client
  // (cree plus bas). checkAuth garantit que la RLS CDP (EXISTS sur projet)
  // ne soit pas contournee par un appel direct au server action.
  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // Verifie que le client existe et n'est pas archive (Odoo et numerotation
  // ont besoin du trigramme du client).
  const { data: client } = await supabase
    .from('clients')
    .select('id, archive, trigramme')
    .eq('id', clientId)
    .single();
  if (!client) return { success: false, error: 'Client introuvable' };
  if (client.archive) {
    return { success: false, error: 'Client archivé' };
  }

  // Invariant "aucune facture sans projet" : rattache la facture libre au
  // projet libre du client (cree a la volee si absent). Admin-only deja
  // garanti par checkAuth ci-dessus -> l'INSERT du projet passe la RLS.
  const projetLibre = await getOrCreateProjetLibre(supabase, clientId);
  if (!projetLibre.ok) return { success: false, error: projetLibre.error };

  const result = await insertBrouillonWithLignes({
    supabase,
    userId: user.id,
    projetId: projetLibre.projetId,
    clientId,
    societeEmettriceId,
    lignes: lignes.map((l) => ({
      contrat_id: null,
      description: l.description,
      montant_ht: l.montantHt,
      mois_relatif: 0,
      quote_part: 0,
      npec_snapshot: 0,
      taux_commission_snapshot: 0,
    })),
    logScope: 'createFreeBrouillon',
  });

  if (!result.ok) return { success: false, error: result.error };

  logAudit(
    'free_brouillon_created',
    'facture',
    result.factureId,
    {
      clientId,
      lignesCount: lignes.length,
      montantHt: result.totalHt,
    },
    user.id,
  );

  revalidatePath('/facturation');

  return { success: true, id: result.factureId };
}
