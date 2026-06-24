'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/guards';
import { canAccessPipeline, isAdmin } from '@/lib/utils/roles';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import type { Database } from '@/types/database';
import { getAuth, type StageProspect } from './shared';

// ---------------------------------------------------------------------------
// Schemas Zod (validation cote serveur, defense en profondeur)
// ---------------------------------------------------------------------------
// Pourquoi : RLS bloque les acces non autorises mais ne contraint pas le
// type. Sans ces guards, un client peut poster ids=garbage, stage hors enum,
// commercialId hostile, ce qui crash la query Postgres ou corrompt la base.

const stageSchema = z.enum(
  ['a_qualifier', 'presente', 'cadre', 'audite', 'signe', 'perdu'],
  { message: 'Stage invalide' },
);

const LoadProspectDetailsSchema = z.object({
  id: z.string().uuid('Prospect ID doit être un UUID'),
});

const UpdateProspectStageSchema = z.object({
  id: z.string().uuid('Prospect ID doit être un UUID'),
  stage: stageSchema,
});

const UpdateProspectAssignmentSchema = z.object({
  id: z.string().uuid('Prospect ID doit être un UUID'),
  commercialId: z.string().uuid('commercialId doit être un UUID').nullable(),
});

const BulkUpdateProspectsSchema = z.object({
  ids: z
    .array(z.string().uuid('ID doit être un UUID'))
    .min(1, 'Aucun prospect sélectionné')
    .max(500, 'Maximum 500 prospects par operation'),
  patch: z
    .object({
      commercialId: z
        .string()
        .uuid('commercialId doit être un UUID')
        .nullable()
        .optional(),
      stage: stageSchema.optional(),
    })
    .refine(
      (p) => p.commercialId !== undefined || p.stage !== undefined,
      'Aucune modification fournie',
    ),
});

const AddProspectNoteSchema = z.object({
  prospectId: z.string().uuid('Prospect ID doit être un UUID'),
  contenu: z.string().trim().min(1, 'Le contenu est requis').max(2000),
});

const ConvertProspectSchema = z.object({
  id: z.string().uuid('Prospect ID doit être un UUID'),
});

const DeleteProspectSchema = z.object({
  id: z.string().uuid('Prospect ID doit être un UUID'),
});

// ---------------------------------------------------------------------------
// Load prospect details (for side panel)
// ---------------------------------------------------------------------------

export async function loadProspectDetails(id: string) {
  const parsed = LoadProspectDetailsSchema.safeParse({ id });
  if (!parsed.success) {
    return { prospect: null, notes: [], convertedClient: null, rdvs: [] };
  }

  const auth = await requireAuth();
  if (!auth.ok) {
    return { prospect: null, notes: [], convertedClient: null, rdvs: [] };
  }
  const { supabase } = auth;

  const [prospectResult, notesResult, rdvsResult] = await Promise.all([
    supabase
      .from('prospects')
      .select(
        '*, commercial:users!prospects_commercial_id_fkey(id, nom, prenom), client:clients(id, raison_sociale)',
      )
      .eq('id', parsed.data.id)
      .maybeSingle(),
    supabase
      .from('prospect_notes')
      .select(
        '*, user:users!prospect_notes_user_id_fkey(id, nom, prenom, role)',
      )
      .eq('prospect_id', parsed.data.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('rdv_commerciaux')
      .select(
        '*, commercial:users!rdv_commerciaux_commercial_id_fkey(id, nom, prenom)',
      )
      .eq('prospect_id', parsed.data.id)
      .order('date_prevue', { ascending: false }),
  ]);

  const prospect = prospectResult.data;
  const notes = notesResult.data ?? [];
  const rdvs = rdvsResult.data ?? [];
  const convertedClient = prospect?.client
    ? {
        id: prospect.client.id,
        raison_sociale: prospect.client.raison_sociale,
      }
    : null;

  return { prospect, notes, convertedClient, rdvs };
}

// ---------------------------------------------------------------------------
// Update stage (drag-drop)
// ---------------------------------------------------------------------------

export async function updateProspectStage(
  id: string,
  stage: StageProspect,
): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateProspectStageSchema.safeParse({ id, stage });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const { supabase, user, role, pipelineAccess } = await getAuth();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!canAccessPipeline(role, pipelineAccess)) {
    return { success: false, error: 'Accès refusé' };
  }

  const { error } = await supabase
    .from('prospects')
    .update({ stage: parsed.data.stage })
    .eq('id', parsed.data.id);

  if (error) {
    logger.error('actions.prospects', 'updateProspectStage failed', {
      id: parsed.data.id,
      stage: parsed.data.stage,
      error,
    });
    return { success: false, error: error.message };
  }

  logAudit(
    'prospect_stage_updated',
    'prospect',
    parsed.data.id,
    { stage: parsed.data.stage },
    user.id,
  );
  revalidatePath('/commercial/prospects');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Update commercial assignment
// ---------------------------------------------------------------------------

export async function updateProspectAssignment(
  id: string,
  commercialId: string | null,
): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateProspectAssignmentSchema.safeParse({ id, commercialId });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const { supabase, user, role, pipelineAccess } = await getAuth();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!canAccessPipeline(role, pipelineAccess)) {
    return { success: false, error: 'Accès refusé' };
  }

  const { error } = await supabase
    .from('prospects')
    .update({ commercial_id: parsed.data.commercialId })
    .eq('id', parsed.data.id);

  if (error) {
    logger.error('actions.prospects', 'updateProspectAssignment failed', {
      id: parsed.data.id,
      commercialId: parsed.data.commercialId,
      error,
    });
    return { success: false, error: error.message };
  }

  logAudit(
    'prospect_assigned',
    'prospect',
    parsed.data.id,
    { commercialId: parsed.data.commercialId },
    user.id,
  );
  revalidatePath('/commercial/prospects');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Bulk update (assignment + stage)
// ---------------------------------------------------------------------------

export async function bulkUpdateProspects(
  ids: string[],
  patch: { commercialId?: string | null; stage?: StageProspect },
): Promise<{ success: boolean; updated?: number; error?: string }> {
  const parsed = BulkUpdateProspectsSchema.safeParse({ ids, patch });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const update: Database['public']['Tables']['prospects']['Update'] = {};
  if (parsed.data.patch.commercialId !== undefined)
    update.commercial_id = parsed.data.patch.commercialId;
  if (parsed.data.patch.stage !== undefined)
    update.stage = parsed.data.patch.stage;

  const { supabase, user, role, pipelineAccess } = await getAuth();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!canAccessPipeline(role, pipelineAccess)) {
    return { success: false, error: 'Accès refusé' };
  }

  const { error } = await supabase
    .from('prospects')
    .update(update)
    .in('id', parsed.data.ids);

  if (error) {
    logger.error('actions.prospects', 'bulkUpdateProspects failed', {
      count: parsed.data.ids.length,
      patch: parsed.data.patch,
      error,
    });
    return { success: false, error: error.message };
  }

  logAudit(
    'prospects_bulk_updated',
    'prospect',
    undefined,
    {
      count: parsed.data.ids.length,
      patch: parsed.data.patch,
    },
    user.id,
  );
  revalidatePath('/commercial/prospects');
  return { success: true, updated: parsed.data.ids.length };
}

// ---------------------------------------------------------------------------
// Add note
// ---------------------------------------------------------------------------

export async function addProspectNote(
  prospectId: string,
  contenu: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = AddProspectNoteSchema.safeParse({ prospectId, contenu });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const { supabase, user, role, pipelineAccess } = await getAuth();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!canAccessPipeline(role, pipelineAccess)) {
    return { success: false, error: 'Accès refusé' };
  }

  const { error } = await supabase.from('prospect_notes').insert({
    prospect_id: parsed.data.prospectId,
    user_id: user.id,
    contenu: parsed.data.contenu,
  });

  if (error) return { success: false, error: error.message };

  logAudit(
    'note_added',
    'prospect',
    parsed.data.prospectId,
    undefined,
    user.id,
  );
  revalidatePath('/commercial/prospects');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Convert signed prospect to client
// ---------------------------------------------------------------------------

export async function convertProspectToClient(
  id: string,
): Promise<{ success: boolean; clientId?: string; error?: string }> {
  const parsed = ConvertProspectSchema.safeParse({ id });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const { supabase, user, role } = await getAuth();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!isAdmin(role)) {
    return {
      success: false,
      error: 'Seuls les admins peuvent convertir un prospect en client',
    };
  }

  const { data: prospect, error: fetchError } = await supabase
    .from('prospects')
    .select('*')
    .eq('id', parsed.data.id)
    .single();

  if (fetchError || !prospect) {
    return { success: false, error: 'Prospect introuvable' };
  }

  if (prospect.stage !== 'signe') {
    return {
      success: false,
      error: 'Seuls les prospects signés peuvent être convertis',
    };
  }

  if (prospect.client_id) {
    return { success: false, error: 'Ce prospect a déjà été converti' };
  }

  const { data: client, error: insertError } = await supabase
    .from('clients')
    .insert({
      trigramme: '',
      raison_sociale: prospect.nom,
      siret: prospect.siret,
      apporteur_commercial_id: prospect.commercial_id,
      apporteur_date: new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .single();

  if (insertError || !client) {
    logger.error('actions.prospects', 'convertProspectToClient failed', {
      id: parsed.data.id,
      error: insertError,
    });
    return {
      success: false,
      error: insertError?.message || 'Erreur lors de la création du client',
    };
  }

  const { error: linkError } = await supabase
    .from('prospects')
    .update({ client_id: client.id })
    .eq('id', parsed.data.id);
  if (linkError) {
    // Le client est cree mais le prospect n est pas lie : etat partiellement
    // incoherent (admin verra le client dans la liste mais le prospect reste
    // 'signe' sans client_id). On loggue mais on ne fail pas l action - le
    // client a ete cree avec succes, l user peut relier manuellement.
    logger.warn(
      'actions.prospects',
      'convertProspectToClient link prospect failed',
      {
        prospectId: parsed.data.id,
        clientId: client.id,
        error: linkError,
      },
    );
  }

  logAudit(
    'prospect_converted',
    'prospect',
    parsed.data.id,
    { clientId: client.id },
    user.id,
  );
  revalidatePath('/commercial/prospects');
  revalidatePath('/admin/clients');
  return { success: true, clientId: client.id };
}

// ---------------------------------------------------------------------------
// Delete prospect (admin only, soft delete via archive=true)
// ---------------------------------------------------------------------------

export async function deleteProspect(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = DeleteProspectSchema.safeParse({ id });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const { supabase, user, role } = await getAuth();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!isAdmin(role)) {
    return {
      success: false,
      error: 'Seuls les admins peuvent supprimer un prospect',
    };
  }

  const { error } = await supabase
    .from('prospects')
    .update({ archive: true })
    .eq('id', parsed.data.id);

  if (error) {
    logger.error('actions.prospects', 'deleteProspect failed', {
      id: parsed.data.id,
      error,
    });
    return { success: false, error: error.message };
  }

  logAudit('prospect_deleted', 'prospect', parsed.data.id, undefined, user.id);
  revalidatePath('/commercial/prospects');
  return { success: true };
}
