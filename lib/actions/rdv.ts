'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/guards';
import { isAdmin } from '@/lib/utils/roles';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import type { StatutRdv } from '@/lib/utils/constants';

// ---------------------------------------------------------------------------
// Schemas Zod (validation cote serveur, defense en profondeur)
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const rdvIdSchema = z.string().uuid('RDV ID doit etre un UUID');
const projetIdSchema = z.string().uuid('Projet ID doit etre un UUID');
const prospectIdSchema = z.string().uuid('Prospect ID doit etre un UUID');
const formateurIdSchema = z
  .string()
  .uuid('Formateur ID doit etre un UUID')
  .nullable()
  .optional();
const datePrevueSchema = z
  .string()
  .regex(ISO_DATE_RE, 'Date au format YYYY-MM-DD requise');
const shortTextSchema = z
  .string()
  .trim()
  .max(2000, 'Texte trop long')
  .optional();
const statutRdvSchema = z.enum(['prevu', 'realise', 'annule']);

const CreateRdvFormateurSchema = z.object({
  projetId: projetIdSchema,
  data: z.object({
    formateurNom: shortTextSchema,
    formateurId: formateurIdSchema,
    datePrevue: datePrevueSchema,
    objet: shortTextSchema,
    notes: shortTextSchema,
  }),
});

const UpdateRdvFormateurStatutSchema = z.object({
  id: rdvIdSchema,
  statut: statutRdvSchema,
});

const RdvIdOnlySchema = z.object({ id: rdvIdSchema });

const CreateRdvCommercialSchema = z.object({
  prospectId: prospectIdSchema,
  data: z.object({
    datePrevue: datePrevueSchema,
    objet: shortTextSchema,
    notes: shortTextSchema,
  }),
});

// ---------------------------------------------------------------------------
// RDV formateurs (CDP scope)
// ---------------------------------------------------------------------------

export async function createRdvFormateur(
  projetId: string,
  data: {
    formateurNom?: string;
    formateurId?: string | null;
    datePrevue: string;
    objet?: string;
    notes?: string;
  },
): Promise<{ success: boolean; id?: string; error?: string }> {
  const parsed = CreateRdvFormateurSchema.safeParse({ projetId, data });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }
  projetId = parsed.data.projetId;
  data = parsed.data.data;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { data: rdv, error } = await supabase
    .from('rdv_formateurs')
    .insert({
      projet_id: projetId,
      cdp_id: user.id,
      formateur_id: data.formateurId ?? null,
      formateur_nom: data.formateurNom?.trim() || null,
      date_prevue: data.datePrevue,
      objet: data.objet?.trim() || null,
      notes: data.notes?.trim() || null,
    })
    .select('id')
    .single();

  if (error || !rdv) {
    logger.error('actions.rdv', 'createRdvFormateur failed', { error });
    return { success: false, error: error?.message ?? 'Erreur' };
  }

  logAudit(
    'rdv_formateur_created',
    'rdv_formateur',
    rdv.id,
    undefined,
    user.id,
  );
  revalidatePath(`/projets/[ref]`, 'page');
  return { success: true, id: rdv.id };
}

export async function updateRdvFormateurStatut(
  id: string,
  statut: StatutRdv,
): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateRdvFormateurStatutSchema.safeParse({ id, statut });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }
  id = parsed.data.id;
  statut = parsed.data.statut;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const update: { statut: StatutRdv; date_realisee?: string | null } = {
    statut,
  };
  if (statut === 'realise') {
    update.date_realisee = new Date().toISOString().slice(0, 10);
  } else if (statut === 'prevu') {
    update.date_realisee = null;
  }

  const { error } = await supabase
    .from('rdv_formateurs')
    .update(update)
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  logAudit(
    'rdv_formateur_statut_updated',
    'rdv_formateur',
    id,
    { statut },
    user.id,
  );
  revalidatePath(`/projets/[ref]`, 'page');
  return { success: true };
}

export async function deleteRdvFormateur(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = RdvIdOnlySchema.safeParse({ id });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }
  id = parsed.data.id;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase.from('rdv_formateurs').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  logAudit('rdv_formateur_deleted', 'rdv_formateur', id, undefined, user.id);
  revalidatePath(`/projets/[ref]`, 'page');
  return { success: true };
}

// ---------------------------------------------------------------------------
// RDV commerciaux (pipeline scope)
// ---------------------------------------------------------------------------

export async function createRdvCommercial(
  prospectId: string,
  data: { datePrevue: string; objet?: string; notes?: string },
): Promise<{ success: boolean; id?: string; error?: string }> {
  const parsed = CreateRdvCommercialSchema.safeParse({ prospectId, data });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }
  prospectId = parsed.data.prospectId;
  data = parsed.data.data;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { data: rdv, error } = await supabase
    .from('rdv_commerciaux')
    .insert({
      prospect_id: prospectId,
      commercial_id: user.id,
      date_prevue: data.datePrevue,
      objet: data.objet?.trim() || null,
      notes: data.notes?.trim() || null,
    })
    .select('id')
    .single();

  if (error || !rdv) {
    logger.error('actions.rdv', 'createRdvCommercial failed', { error });
    return { success: false, error: error?.message ?? 'Erreur' };
  }

  logAudit(
    'rdv_commercial_created',
    'rdv_commercial',
    rdv.id,
    undefined,
    user.id,
  );
  revalidatePath('/commercial/pipeline');
  return { success: true, id: rdv.id };
}

export async function updateRdvCommercialStatut(
  id: string,
  statut: StatutRdv,
): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateRdvFormateurStatutSchema.safeParse({ id, statut });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }
  id = parsed.data.id;
  statut = parsed.data.statut;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const update: { statut: StatutRdv; date_realisee?: string | null } = {
    statut,
  };
  if (statut === 'realise') {
    update.date_realisee = new Date().toISOString().slice(0, 10);
  } else if (statut === 'prevu') {
    update.date_realisee = null;
  }

  const { error } = await supabase
    .from('rdv_commerciaux')
    .update(update)
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  logAudit(
    'rdv_commercial_statut_updated',
    'rdv_commercial',
    id,
    { statut },
    user.id,
  );
  revalidatePath('/commercial/pipeline');
  return { success: true };
}

export async function deleteRdvCommercial(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = RdvIdOnlySchema.safeParse({ id });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }
  id = parsed.data.id;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { data: existing } = await supabase
    .from('rdv_commerciaux')
    .select('commercial_id')
    .eq('id', id)
    .single();

  const { data: caller } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (
    existing &&
    existing.commercial_id !== user.id &&
    !isAdmin(caller?.role)
  ) {
    return { success: false, error: 'Accès refusé' };
  }

  const { error } = await supabase
    .from('rdv_commerciaux')
    .delete()
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  logAudit('rdv_commercial_deleted', 'rdv_commercial', id, undefined, user.id);
  revalidatePath('/commercial/pipeline');
  return { success: true };
}
