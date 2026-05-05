'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/utils/roles';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import { parseJalons, validateJalons } from '@/lib/echeancier/calc';
import type { Json } from '@/types/database';

const SCOPE = 'actions.echeanciers';

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Non authentifié' };
  const { data } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!isAdmin(data?.role))
    return { ok: false as const, error: 'Accès refusé' };
  return { ok: true as const, supabase, userId: user.id };
}

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
