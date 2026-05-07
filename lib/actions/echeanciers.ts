'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import { parseJalons, validateJalons } from '@/lib/echeancier/calc';
import type { Json } from '@/types/database';

const SCOPE = 'actions.echeanciers';

/** Assigne un template à un projet (ou clear si null) */
export async function setProjetEcheancierTemplate(params: {
  projetId: string;
  templateId: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const { error } = await auth.supabase
    .from('projets')
    .update({
      echeancier_template_id: params.templateId,
      echeancier_override: null, // reset l'override quand on change de template
    })
    .eq('id', params.projetId);
  if (error) {
    logger.error(SCOPE, 'set template failed', { error });
    return { success: false, error: error.message };
  }
  logAudit('projet_echeancier_template', 'projet', params.projetId, {
    template_id: params.templateId,
  });
  revalidatePath('/projets');
  return { success: true };
}

// ---------------------------------------------------------------------------
// CRUD templates (admin only)
// ---------------------------------------------------------------------------

export async function createEcheancierTemplate(params: {
  nom: string;
  description: string | null;
  jalons: Array<{ mois_relatif: number; quote_part: number; label?: string }>;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const validation = validateJalons(parseJalons(params.jalons));
  if (!validation.ok) {
    return { success: false, error: validation.errors.join(', ') };
  }

  const { data, error } = await auth.supabase
    .from('echeanciers_templates')
    .insert({
      nom: params.nom.trim(),
      description: params.description?.trim() || null,
      jalons: params.jalons as unknown as Json,
      is_default: false,
    })
    .select('id')
    .single();
  if (error) {
    logger.error(SCOPE, 'createTemplate failed', { error });
    return { success: false, error: error.message };
  }
  logAudit('echeancier_template_created', 'echeanciers_templates', data.id, {
    nom: params.nom,
  });
  revalidatePath('/admin/parametres');
  return { success: true, id: data.id };
}

export async function updateEcheancierTemplate(params: {
  id: string;
  nom: string;
  description: string | null;
  jalons: Array<{ mois_relatif: number; quote_part: number; label?: string }>;
}): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const validation = validateJalons(parseJalons(params.jalons));
  if (!validation.ok) {
    return { success: false, error: validation.errors.join(', ') };
  }

  const { error } = await auth.supabase
    .from('echeanciers_templates')
    .update({
      nom: params.nom.trim(),
      description: params.description?.trim() || null,
      jalons: params.jalons as unknown as Json,
    })
    .eq('id', params.id);
  if (error) return { success: false, error: error.message };
  logAudit('echeancier_template_updated', 'echeanciers_templates', params.id);
  revalidatePath('/admin/parametres');
  return { success: true };
}

/** Marque un template comme defaut (et retire le flag des autres) */
export async function setEcheancierTemplateDefault(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  // Retire le flag de tous, puis le pose sur le bon (transaction implicite
  // - si la 1ere update echoue, on annule)
  const { error: clearErr } = await auth.supabase
    .from('echeanciers_templates')
    .update({ is_default: false })
    .eq('is_default', true);
  if (clearErr) return { success: false, error: clearErr.message };

  const { error: setErr } = await auth.supabase
    .from('echeanciers_templates')
    .update({ is_default: true })
    .eq('id', id);
  if (setErr) return { success: false, error: setErr.message };

  logAudit('echeancier_template_set_default', 'echeanciers_templates', id);
  revalidatePath('/admin/parametres');
  revalidatePath('/projets');
  return { success: true };
}

export async function archiveEcheancierTemplate(
  id: string,
  archive: boolean,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const { error } = await auth.supabase
    .from('echeanciers_templates')
    .update({ archive })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  logAudit(
    archive ? 'echeancier_template_archived' : 'echeancier_template_restored',
    'echeanciers_templates',
    id,
  );
  revalidatePath('/admin/parametres');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Ajustements pending : resolution manuelle
// ---------------------------------------------------------------------------

export async function resolveAjustement(params: {
  id: string;
  action: 'emitted' | 'ignored';
  factureId?: string;
}): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const { error } = await auth.supabase
    .from('facturation_ajustements_pending')
    .update({
      resolved_at: new Date().toISOString(),
      resolved_action: params.action,
      resolved_by: auth.user.id,
      resolved_facture_id: params.factureId ?? null,
    })
    .eq('id', params.id);
  if (error) return { success: false, error: error.message };
  logAudit(
    params.action === 'emitted' ? 'ajustement_emitted' : 'ajustement_ignored',
    'facturation_ajustements_pending',
    params.id,
  );
  revalidatePath('/facturation');
  return { success: true };
}

/** Override JSONB sur un projet (jalons custom) */
export async function setProjetEcheancierOverride(params: {
  projetId: string;
  jalons: Array<{
    mois_relatif: number;
    quote_part: number;
    label?: string;
  }> | null;
}): Promise<{ success: boolean; error?: string; warnings?: string[] }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  if (params.jalons !== null) {
    const validation = validateJalons(parseJalons(params.jalons));
    if (!validation.ok) {
      return { success: false, error: validation.errors.join(', ') };
    }

    const { error } = await auth.supabase
      .from('projets')
      .update({ echeancier_override: params.jalons as unknown as Json })
      .eq('id', params.projetId);
    if (error) {
      logger.error(SCOPE, 'set override failed', { error });
      return { success: false, error: error.message };
    }
    logAudit('projet_echeancier_override', 'projet', params.projetId, {
      jalons: params.jalons,
    } as unknown as Record<string, Json>);
    revalidatePath('/projets');
    return {
      success: true,
      warnings:
        validation.warnings.length > 0 ? validation.warnings : undefined,
    };
  }

  // Clear override
  const { error } = await auth.supabase
    .from('projets')
    .update({ echeancier_override: null })
    .eq('id', params.projetId);
  if (error) return { success: false, error: error.message };
  logAudit('projet_echeancier_override_cleared', 'projet', params.projetId);
  revalidatePath('/projets');
  return { success: true };
}
