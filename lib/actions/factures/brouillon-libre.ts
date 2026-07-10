'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { checkAuth } from '@/lib/auth/guards';
import { logAudit } from '@/lib/utils/audit';
import { resolveTauxCommission } from '@/lib/utils/commission';
import {
  uuidSchema,
  montantHtSchema,
  insertBrouillonWithLignes,
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

// (Le helper insertBrouillonWithLignes vit dans brouillons-shared.ts :
// ce module 'use server' ne peut exporter que des actions.)

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

  const tauxProjet = resolveTauxCommission(projet.taux_commission);
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
