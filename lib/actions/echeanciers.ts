'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import { parseJalons, validateJalons } from '@/lib/echeancier/calc';
import type { Json } from '@/types/database';

const SCOPE = 'actions.echeanciers';

// ---------------------------------------------------------------------------
// Schemas Zod (validation cote serveur, defense en profondeur)
// ---------------------------------------------------------------------------
// Pourquoi : RLS bloque les acces non autorises mais ne contraint pas les
// types. Sans guards, un client peut poster mois_relatif=NaN, quote_part
// negative, ou un id non-UUID et corrompre les donnees ou crasher la query.

const projetIdSchema = z.string().uuid('Projet ID doit etre un UUID');
const templateIdSchema = z.string().uuid('Template ID doit etre un UUID');

const JalonSchema = z.object({
  mois_relatif: z
    .number()
    .int('mois_relatif doit etre un entier')
    .gte(1, 'mois_relatif doit etre >= 1')
    .lte(120, 'mois_relatif trop grand'),
  quote_part: z
    .number()
    .finite('quote_part doit etre un nombre fini')
    .gt(0, 'quote_part doit etre strictement positif')
    .lte(1, 'quote_part doit etre <= 1'),
  label: z.string().trim().max(200).optional(),
});

const JalonsArraySchema = z
  .array(JalonSchema)
  .min(1, 'Au moins un jalon requis')
  .max(60, 'Trop de jalons (max 60)');

const SetProjetEcheancierTemplateSchema = z.object({
  projetId: projetIdSchema,
  templateId: templateIdSchema.nullable(),
});

const CreateEcheancierTemplateSchema = z.object({
  nom: z
    .string()
    .trim()
    .min(1, 'Nom requis')
    .max(200, 'Nom trop long (max 200)'),
  description: z.string().trim().max(2000).nullable(),
  jalons: JalonsArraySchema,
});

const UpdateEcheancierTemplateSchema = z.object({
  id: templateIdSchema,
  nom: z
    .string()
    .trim()
    .min(1, 'Nom requis')
    .max(200, 'Nom trop long (max 200)'),
  description: z.string().trim().max(2000).nullable(),
  jalons: JalonsArraySchema,
});

const ResolveAjustementSchema = z.object({
  id: z.string().uuid('Ajustement ID doit etre un UUID'),
  action: z.enum(['emitted', 'ignored']),
  factureId: z.string().uuid('Facture ID doit etre un UUID').optional(),
});

const SetProjetEcheancierOverrideSchema = z.object({
  projetId: projetIdSchema,
  jalons: JalonsArraySchema.nullable(),
});

/** Assigne un template à un projet (ou clear si null) */
export async function setProjetEcheancierTemplate(params: {
  projetId: string;
  templateId: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const parsed = SetProjetEcheancierTemplateSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const { error } = await auth.supabase
    .from('projets')
    .update({
      echeancier_template_id: parsed.data.templateId,
      echeancier_override: null, // reset l'override quand on change de template
    })
    .eq('id', parsed.data.projetId);
  if (error) {
    logger.error(SCOPE, 'set template failed', { error });
    return { success: false, error: error.message };
  }
  logAudit(
    'projet_echeancier_template',
    'projet',
    parsed.data.projetId,
    {
      template_id: parsed.data.templateId,
    },
    auth.user.id,
  );
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
  const parsed = CreateEcheancierTemplateSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const validation = validateJalons(parseJalons(parsed.data.jalons));
  if (!validation.ok) {
    return { success: false, error: validation.errors.join(', ') };
  }

  const { data, error } = await auth.supabase
    .from('echeanciers_templates')
    .insert({
      nom: parsed.data.nom,
      description: parsed.data.description?.trim() || null,
      jalons: parsed.data.jalons as unknown as Json,
      is_default: false,
    })
    .select('id')
    .single();
  if (error) {
    logger.error(SCOPE, 'createTemplate failed', { error });
    return { success: false, error: error.message };
  }
  logAudit(
    'echeancier_template_created',
    'echeanciers_templates',
    data.id,
    {
      nom: parsed.data.nom,
    },
    auth.user.id,
  );
  revalidatePath('/admin/parametres');
  return { success: true, id: data.id };
}

export async function updateEcheancierTemplate(params: {
  id: string;
  nom: string;
  description: string | null;
  jalons: Array<{ mois_relatif: number; quote_part: number; label?: string }>;
}): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateEcheancierTemplateSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const validation = validateJalons(parseJalons(parsed.data.jalons));
  if (!validation.ok) {
    return { success: false, error: validation.errors.join(', ') };
  }

  const { error } = await auth.supabase
    .from('echeanciers_templates')
    .update({
      nom: parsed.data.nom,
      description: parsed.data.description?.trim() || null,
      jalons: parsed.data.jalons as unknown as Json,
    })
    .eq('id', parsed.data.id);
  if (error) return { success: false, error: error.message };
  logAudit(
    'echeancier_template_updated',
    'echeanciers_templates',
    parsed.data.id,
    undefined,
    auth.user.id,
  );
  revalidatePath('/admin/parametres');
  return { success: true };
}

/** Marque un template comme defaut (et retire le flag des autres) */
export async function setEcheancierTemplateDefault(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = templateIdSchema.safeParse(id);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

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
    .eq('id', parsed.data);
  if (setErr) return { success: false, error: setErr.message };

  logAudit(
    'echeancier_template_set_default',
    'echeanciers_templates',
    parsed.data,
    undefined,
    auth.user.id,
  );
  revalidatePath('/admin/parametres');
  revalidatePath('/projets');
  return { success: true };
}

const ArchiveEcheancierTemplateSchema = z.object({
  id: templateIdSchema,
  archive: z.boolean(),
});

export async function archiveEcheancierTemplate(
  id: string,
  archive: boolean,
): Promise<{ success: boolean; error?: string }> {
  const parsed = ArchiveEcheancierTemplateSchema.safeParse({ id, archive });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const { error } = await auth.supabase
    .from('echeanciers_templates')
    .update({ archive: parsed.data.archive })
    .eq('id', parsed.data.id);
  if (error) return { success: false, error: error.message };
  logAudit(
    parsed.data.archive
      ? 'echeancier_template_archived'
      : 'echeancier_template_restored',
    'echeanciers_templates',
    parsed.data.id,
    undefined,
    auth.user.id,
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
  const parsed = ResolveAjustementSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const { error } = await auth.supabase
    .from('facturation_ajustements_pending')
    .update({
      resolved_at: new Date().toISOString(),
      resolved_action: parsed.data.action,
      resolved_by: auth.user.id,
      resolved_facture_id: parsed.data.factureId ?? null,
    })
    .eq('id', parsed.data.id);
  if (error) return { success: false, error: error.message };
  logAudit(
    parsed.data.action === 'emitted'
      ? 'ajustement_emitted'
      : 'ajustement_ignored',
    'facturation_ajustements_pending',
    parsed.data.id,
    undefined,
    auth.user.id,
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
  const parsed = SetProjetEcheancierOverrideSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  if (parsed.data.jalons !== null) {
    const validation = validateJalons(parseJalons(parsed.data.jalons));
    if (!validation.ok) {
      return { success: false, error: validation.errors.join(', ') };
    }

    const { error } = await auth.supabase
      .from('projets')
      .update({ echeancier_override: parsed.data.jalons as unknown as Json })
      .eq('id', parsed.data.projetId);
    if (error) {
      logger.error(SCOPE, 'set override failed', { error });
      return { success: false, error: error.message };
    }
    logAudit(
      'projet_echeancier_override',
      'projet',
      parsed.data.projetId,
      {
        jalons: parsed.data.jalons,
      } as unknown as Record<string, Json>,
      auth.user.id,
    );
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
    .eq('id', parsed.data.projetId);
  if (error) return { success: false, error: error.message };
  logAudit(
    'projet_echeancier_override_cleared',
    'projet',
    parsed.data.projetId,
    undefined,
    auth.user.id,
  );
  revalidatePath('/projets');
  return { success: true };
}
