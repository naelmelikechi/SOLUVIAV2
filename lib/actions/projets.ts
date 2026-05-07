'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';

// ---------------------------------------------------------------------------
// Schemas Zod (validation cote serveur, defense en profondeur)
// ---------------------------------------------------------------------------
// Pourquoi : RLS gere l'acces, pas les types. Sans ces guards, un client peut
// poster taux=NaN, billing_mode='garbage' ou un id non-UUID et corrompre la
// donnee ou crasher la query Supabase.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const projetIdSchema = z.string().uuid('Projet ID doit etre un UUID');

const tauxCommissionSchema = z
  .number()
  .finite('Taux doit etre un nombre fini')
  .gte(0, 'Taux doit etre >= 0')
  .lte(100, 'Taux doit etre <= 100');

const CreateProjetSchema = z.object({
  clientId: z.string().uuid('Client ID doit etre un UUID'),
  typologieId: z.string().uuid('Typologie ID doit etre un UUID'),
  cdpId: z.string().uuid('CDP ID doit etre un UUID'),
  backupCdpId: z.string().uuid('Backup CDP ID doit etre un UUID').optional(),
  tauxCommission: tauxCommissionSchema.optional(),
  dateDebut: z
    .string()
    .regex(ISO_DATE_RE, 'Date au format YYYY-MM-DD requise')
    .optional(),
});

const UpdateProjetTauxCommissionSchema = z.object({
  projetId: projetIdSchema,
  tauxCommission: tauxCommissionSchema,
});

const UpdateProjetBillingModeSchema = z.object({
  projetId: projetIdSchema,
  mode: z.enum(['auto', 'manual']),
});

const DuplicateProjetSchema = projetIdSchema;

export async function createProjet(data: {
  clientId: string;
  typologieId: string;
  cdpId: string;
  backupCdpId?: string;
  tauxCommission?: number;
  dateDebut?: string;
}): Promise<{ success: boolean; ref?: string; error?: string }> {
  const parsed = CreateProjetSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // Conserve les messages metier d'origine pour les champs requis (pour tests
    // et UX coherente avec l'existant) en fallback sur le message Zod.
    const path = issue?.path[0];
    if (path === 'clientId') {
      return { success: false, error: 'Le client est requis' };
    }
    if (path === 'typologieId') {
      return { success: false, error: 'La typologie est requise' };
    }
    if (path === 'cdpId') {
      return { success: false, error: 'Le chef de projet est requis' };
    }
    return {
      success: false,
      error: issue?.message ?? 'Donnees invalides',
    };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // Validate CDP != backup CDP
  if (
    parsed.data.backupCdpId &&
    parsed.data.backupCdpId === parsed.data.cdpId
  ) {
    return {
      success: false,
      error: 'Le CDP titulaire et le CDP backup doivent être différents',
    };
  }

  const { data: projet, error } = await supabase
    .from('projets')
    .insert({
      client_id: parsed.data.clientId,
      typologie_id: parsed.data.typologieId,
      cdp_id: parsed.data.cdpId,
      backup_cdp_id: parsed.data.backupCdpId || null,
      taux_commission: parsed.data.tauxCommission ?? 10,
      date_debut: parsed.data.dateDebut || null,
    })
    .select('id, ref')
    .single();

  if (error) {
    logger.error('actions.projets', 'createProjet failed', { error });
    return {
      success: false,
      error: error.message || 'Erreur lors de la création du projet',
    };
  }

  logAudit('projet_created', 'projet', projet.id, undefined, user.id);

  revalidatePath('/projets');

  return { success: true, ref: projet.ref ?? undefined };
}

export async function updateProjetTauxCommission(
  projetId: string,
  tauxCommission: number,
): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateProjetTauxCommissionSchema.safeParse({
    projetId,
    tauxCommission,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path[0];
    if (path === 'projetId') {
      return { success: false, error: 'Projet manquant' };
    }
    if (path === 'tauxCommission') {
      return {
        success: false,
        error: 'Le taux de commission doit être entre 0 et 100',
      };
    }
    return {
      success: false,
      error: issue?.message ?? 'Donnees invalides',
    };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const rounded = Math.round(parsed.data.tauxCommission * 100) / 100;

  const { data: updated, error } = await supabase
    .from('projets')
    .update({ taux_commission: rounded })
    .eq('id', parsed.data.projetId)
    .select('ref')
    .single();

  if (error) {
    logger.error('actions.projets', 'updateProjetTauxCommission failed', {
      error,
      projetId: parsed.data.projetId,
    });
    return {
      success: false,
      error: error.message || 'Erreur lors de la mise à jour du taux',
    };
  }

  logAudit(
    'projet_taux_commission_updated',
    'projet',
    parsed.data.projetId,
    {
      tauxCommission: rounded,
    },
    user.id,
  );

  revalidatePath('/projets');
  if (updated?.ref) {
    revalidatePath(`/projets/${updated.ref}`);
  }

  return { success: true };
}

export async function updateProjetBillingMode(
  projetId: string,
  mode: 'auto' | 'manual',
): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateProjetBillingModeSchema.safeParse({ projetId, mode });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path[0];
    if (path === 'projetId') {
      return { success: false, error: 'Projet manquant' };
    }
    if (path === 'mode') {
      return { success: false, error: 'Mode de facturation invalide' };
    }
    return {
      success: false,
      error: issue?.message ?? 'Donnees invalides',
    };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { data: updated, error } = await supabase
    .from('projets')
    .update({ billing_mode: parsed.data.mode })
    .eq('id', parsed.data.projetId)
    .select('ref')
    .single();

  if (error) {
    logger.error('actions.projets', 'updateProjetBillingMode failed', {
      error,
      projetId: parsed.data.projetId,
    });
    return {
      success: false,
      error: error.message || 'Erreur lors de la mise à jour du mode',
    };
  }

  logAudit(
    'projet_billing_mode_changed',
    'projet',
    parsed.data.projetId,
    { mode: parsed.data.mode },
    user.id,
  );

  revalidatePath('/projets');
  if (updated?.ref) {
    revalidatePath(`/projets/${updated.ref}`);
  }

  return { success: true };
}

export async function duplicateProjet(
  projetId: string,
): Promise<{ success: boolean; ref?: string; error?: string }> {
  const parsed = DuplicateProjetSchema.safeParse(projetId);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // Fetch the original projet
  const { data: original, error: fetchError } = await supabase
    .from('projets')
    .select(
      'client_id, typologie_id, cdp_id, backup_cdp_id, taux_commission, ref',
    )
    .eq('id', parsed.data)
    .single();

  if (fetchError || !original) {
    logger.error('actions.projets', 'duplicateProjet fetch failed', {
      error: fetchError,
      projetId: parsed.data,
    });
    return { success: false, error: 'Projet source introuvable' };
  }

  // Insert a new projet with the same fields (trigger generates new ref)
  const { data: newProjet, error: insertError } = await supabase
    .from('projets')
    .insert({
      client_id: original.client_id,
      typologie_id: original.typologie_id,
      cdp_id: original.cdp_id,
      backup_cdp_id: original.backup_cdp_id,
      taux_commission: original.taux_commission,
    })
    .select('id, ref')
    .single();

  if (insertError) {
    logger.error('actions.projets', 'duplicateProjet insert failed', {
      error: insertError,
    });
    return {
      success: false,
      error: insertError.message || 'Erreur lors de la duplication du projet',
    };
  }

  logAudit(
    'projet_duplicated',
    'projet',
    newProjet.id,
    {
      sourceRef: original.ref ?? '',
    },
    user.id,
  );

  revalidatePath('/projets');

  return { success: true, ref: newProjet.ref ?? undefined };
}
