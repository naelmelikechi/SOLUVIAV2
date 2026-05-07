'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';

export async function createProjet(data: {
  clientId: string;
  typologieId: string;
  cdpId: string;
  backupCdpId?: string;
  tauxCommission?: number;
  dateDebut?: string;
}): Promise<{ success: boolean; ref?: string; error?: string }> {
  if (!data.clientId) {
    return { success: false, error: 'Le client est requis' };
  }
  if (!data.typologieId) {
    return { success: false, error: 'La typologie est requise' };
  }
  if (!data.cdpId) {
    return { success: false, error: 'Le chef de projet est requis' };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase } = auth;

  // Validate CDP != backup CDP
  if (data.backupCdpId && data.backupCdpId === data.cdpId) {
    return {
      success: false,
      error: 'Le CDP titulaire et le CDP backup doivent être différents',
    };
  }

  const { data: projet, error } = await supabase
    .from('projets')
    .insert({
      client_id: data.clientId,
      typologie_id: data.typologieId,
      cdp_id: data.cdpId,
      backup_cdp_id: data.backupCdpId || null,
      taux_commission: data.tauxCommission ?? 10,
      date_debut: data.dateDebut || null,
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

  logAudit('projet_created', 'projet', projet.id);

  revalidatePath('/projets');

  return { success: true, ref: projet.ref ?? undefined };
}

export async function updateProjetTauxCommission(
  projetId: string,
  tauxCommission: number,
): Promise<{ success: boolean; error?: string }> {
  if (!projetId) {
    return { success: false, error: 'Projet manquant' };
  }
  if (
    !Number.isFinite(tauxCommission) ||
    tauxCommission < 0 ||
    tauxCommission > 100
  ) {
    return {
      success: false,
      error: 'Le taux de commission doit être entre 0 et 100',
    };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase } = auth;

  const rounded = Math.round(tauxCommission * 100) / 100;

  const { data: updated, error } = await supabase
    .from('projets')
    .update({ taux_commission: rounded })
    .eq('id', projetId)
    .select('ref')
    .single();

  if (error) {
    logger.error('actions.projets', 'updateProjetTauxCommission failed', {
      error,
      projetId,
    });
    return {
      success: false,
      error: error.message || 'Erreur lors de la mise à jour du taux',
    };
  }

  logAudit('projet_taux_commission_updated', 'projet', projetId, {
    tauxCommission: rounded,
  });

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
  if (!projetId) {
    return { success: false, error: 'Projet manquant' };
  }
  if (mode !== 'auto' && mode !== 'manual') {
    return { success: false, error: 'Mode de facturation invalide' };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase } = auth;

  const { data: updated, error } = await supabase
    .from('projets')
    .update({ billing_mode: mode })
    .eq('id', projetId)
    .select('ref')
    .single();

  if (error) {
    logger.error('actions.projets', 'updateProjetBillingMode failed', {
      error,
      projetId,
    });
    return {
      success: false,
      error: error.message || 'Erreur lors de la mise à jour du mode',
    };
  }

  logAudit('projet_billing_mode_changed', 'projet', projetId, { mode });

  revalidatePath('/projets');
  if (updated?.ref) {
    revalidatePath(`/projets/${updated.ref}`);
  }

  return { success: true };
}

export async function duplicateProjet(
  projetId: string,
): Promise<{ success: boolean; ref?: string; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase } = auth;

  // Fetch the original projet
  const { data: original, error: fetchError } = await supabase
    .from('projets')
    .select(
      'client_id, typologie_id, cdp_id, backup_cdp_id, taux_commission, ref',
    )
    .eq('id', projetId)
    .single();

  if (fetchError || !original) {
    logger.error('actions.projets', 'duplicateProjet fetch failed', {
      error: fetchError,
      projetId,
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

  logAudit('projet_duplicated', 'projet', newProjet.id, {
    sourceRef: original.ref ?? '',
  });

  revalidatePath('/projets');

  return { success: true, ref: newProjet.ref ?? undefined };
}
