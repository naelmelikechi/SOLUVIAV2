'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth, checkAuth } from '@/lib/auth/guards';
import { logAudit } from '@/lib/utils/audit';
import {
  getLastLinkedinEventForProspect,
  type LinkedinEventRecord,
} from '@/lib/queries/linkedin';
import type { Database } from '@/types/database';

// ---------------------------------------------------------------------------
// CRUD des règles de mapping (admin seul)
// ---------------------------------------------------------------------------

function validateRegex(pattern: string): string | null {
  try {
    void new RegExp(pattern);
    return null;
  } catch (e) {
    return e instanceof Error
      ? `Motif regex invalide : ${e.message}`
      : 'Motif regex invalide';
  }
}

const AddRuleSchema = z.object({
  pattern: z.string().trim().min(1, 'Motif requis').max(500),
  developpeurAffecteId: z.string().uuid('Développeur invalide').nullish(),
  priorite: z.number().int().min(0).max(10_000).optional(),
  actif: z.boolean().optional(),
});

export async function addMappingRule(input: {
  pattern: string;
  developpeurAffecteId?: string | null;
  priorite?: number;
  actif?: boolean;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const parsed = AddRuleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  const regexErr = validateRegex(parsed.data.pattern);
  if (regexErr) return { success: false, error: regexErr };

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from('linkedin_mapping_rules')
    .insert({
      linkedin_company_pattern: parsed.data.pattern,
      developpeur_affecte_id: parsed.data.developpeurAffecteId ?? null,
      priorite: parsed.data.priorite ?? 100,
      actif: parsed.data.actif ?? true,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? 'Création impossible' };
  }
  logAudit(
    'linkedin_rule_created',
    'linkedin_mapping_rule',
    data.id,
    undefined,
    user.id,
  );
  revalidatePath('/commercial/linkedin');
  return { success: true, id: data.id };
}

const UpdateRuleSchema = z.object({
  id: z.string().uuid('Règle invalide'),
  pattern: z.string().trim().min(1, 'Motif requis').max(500).optional(),
  developpeurAffecteId: z.string().uuid('Développeur invalide').nullish(),
  priorite: z.number().int().min(0).max(10_000).optional(),
  actif: z.boolean().optional(),
});

export async function updateMappingRule(input: {
  id: string;
  pattern?: string;
  developpeurAffecteId?: string | null;
  priorite?: number;
  actif?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateRuleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  if (parsed.data.pattern !== undefined) {
    const regexErr = validateRegex(parsed.data.pattern);
    if (regexErr) return { success: false, error: regexErr };
  }

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const patch: Database['public']['Tables']['linkedin_mapping_rules']['Update'] =
    {};
  if (parsed.data.pattern !== undefined) {
    patch.linkedin_company_pattern = parsed.data.pattern;
  }
  if (parsed.data.developpeurAffecteId !== undefined) {
    patch.developpeur_affecte_id = parsed.data.developpeurAffecteId;
  }
  if (parsed.data.priorite !== undefined) patch.priorite = parsed.data.priorite;
  if (parsed.data.actif !== undefined) patch.actif = parsed.data.actif;

  const { error } = await supabase
    .from('linkedin_mapping_rules')
    .update(patch)
    .eq('id', parsed.data.id);

  if (error) return { success: false, error: error.message };
  logAudit(
    'linkedin_rule_updated',
    'linkedin_mapping_rule',
    parsed.data.id,
    undefined,
    user.id,
  );
  revalidatePath('/commercial/linkedin');
  return { success: true };
}

export async function deleteMappingRule(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  if (!z.string().uuid().safeParse(id).success) {
    return { success: false, error: 'Règle invalide' };
  }
  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('linkedin_mapping_rules')
    .delete()
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  logAudit(
    'linkedin_rule_deleted',
    'linkedin_mapping_rule',
    id,
    undefined,
    user.id,
  );
  revalidatePath('/commercial/linkedin');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Lecture pour l'encart fiche (consommée par un composant client)
// ---------------------------------------------------------------------------

/**
 * Dernier évènement LinkedIn d'un prospect, pour l'encart d'origine de la fiche.
 * RLS appliquée via le client serveur de l'appelant (pipeline + admin).
 */
export async function getLastLinkedinEvent(
  prospectId: string,
): Promise<LinkedinEventRecord | null> {
  if (!z.string().uuid().safeParse(prospectId).success) return null;
  const auth = await requireAuth();
  if (!auth.ok) return null;
  return getLastLinkedinEventForProspect(prospectId);
}
