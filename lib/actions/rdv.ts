'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import type { StatutRdv } from '@/lib/utils/constants';

// ---------------------------------------------------------------------------
// Schemas Zod (validation cote serveur, defense en profondeur)
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const rdvIdSchema = z.string().uuid('RDV ID doit être un UUID');
const projetIdSchema = z.string().uuid('Projet ID doit être un UUID');
const formateurIdSchema = z
  .string()
  .uuid('Formateur ID doit être un UUID')
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
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  projetId = parsed.data.projetId;
  data = parsed.data.data;

  const auth = await requireAuth();
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
  // Les RDV formateurs vivent sur /production depuis le lot 0.
  revalidatePath(`/projets/[ref]/production`, 'page');
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
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  id = parsed.data.id;
  statut = parsed.data.statut;

  const auth = await requireAuth();
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
  revalidatePath(`/projets/[ref]/production`, 'page');
  return { success: true };
}

export async function deleteRdvFormateur(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = RdvIdOnlySchema.safeParse({ id });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  id = parsed.data.id;

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase.from('rdv_formateurs').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  logAudit('rdv_formateur_deleted', 'rdv_formateur', id, undefined, user.id);
  revalidatePath(`/projets/[ref]/production`, 'page');
  return { success: true };
}
