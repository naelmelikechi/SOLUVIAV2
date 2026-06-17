'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/guards';
import { isAdmin } from '@/lib/utils/roles';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import type { StatutRdv, TypeRdv, FormatRdv } from '@/lib/utils/constants';

// ---------------------------------------------------------------------------
// Schemas Zod (validation cote serveur, defense en profondeur)
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const rdvIdSchema = z.string().uuid('RDV ID doit être un UUID');
const projetIdSchema = z.string().uuid('Projet ID doit être un UUID');
const prospectIdSchema = z.string().uuid('Prospect ID doit être un UUID');
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

const TYPE_RDV_VALUES = [
  'presentation',
  'cadrage',
  'audit_tunnel_a',
  'audit_tunnel_b',
  'signature',
  'autre',
] as const;
const FORMAT_RDV_VALUES = [
  'presentiel',
  'visio_meet',
  'visio_zoom',
  'visio_teams',
  'telephone',
] as const;
const STATUT_RDV_COMMERCIAL_VALUES = [
  'prevu',
  'realise',
  'annule',
  'reporte',
] as const;
const uuidArraySchema = z.array(z.string().uuid()).max(50);

const CreateRdvCommercialSchema = z.object({
  prospectId: prospectIdSchema,
  data: z.object({
    datePrevue: datePrevueSchema,
    typeRdv: z.enum(TYPE_RDV_VALUES).optional(),
    format: z.enum(FORMAT_RDV_VALUES).nullable().optional(),
    lieu: shortTextSchema,
    dureeMin: z.number().int().min(0).max(1440).nullable().optional(),
    participantsProspect: uuidArraySchema.optional(),
    participantsSoluvia: uuidArraySchema.optional(),
    objet: shortTextSchema,
    notes: shortTextSchema,
  }),
});

const UpdateRdvCommercialSchema = z.object({
  id: rdvIdSchema,
  datePrevue: datePrevueSchema,
  typeRdv: z.enum(TYPE_RDV_VALUES),
  format: z.enum(FORMAT_RDV_VALUES).nullable(),
  lieu: z.string().trim().max(2000).nullable(),
  dureeMin: z.number().int().min(0).max(1440).nullable(),
  statut: z.enum(STATUT_RDV_COMMERCIAL_VALUES),
  participantsProspect: uuidArraySchema,
  participantsSoluvia: uuidArraySchema,
  objet: z.string().trim().max(2000).nullable(),
});

const UpdateRdvCrSchema = z.object({
  id: rdvIdSchema,
  compteRendu: z.string().max(50000).nullable().optional(),
  crFinalise: z.boolean().optional(),
  gabaritVersion: z.string().max(40).nullable().optional(),
});

const UpdateRdvCommercialStatutSchema = z.object({
  id: rdvIdSchema,
  statut: z.enum(STATUT_RDV_COMMERCIAL_VALUES),
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
  revalidatePath(`/projets/[ref]`, 'page');
  return { success: true };
}

// ---------------------------------------------------------------------------
// RDV commerciaux (pipeline scope)
// ---------------------------------------------------------------------------

export async function createRdvCommercial(
  prospectId: string,
  data: {
    datePrevue: string;
    typeRdv?: TypeRdv;
    format?: FormatRdv | null;
    lieu?: string;
    dureeMin?: number | null;
    participantsProspect?: string[];
    participantsSoluvia?: string[];
    objet?: string;
    notes?: string;
  },
): Promise<{ success: boolean; id?: string; error?: string }> {
  const parsed = CreateRdvCommercialSchema.safeParse({ prospectId, data });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  const pid = parsed.data.prospectId;
  const d = parsed.data.data;

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { data: rdv, error } = await supabase
    .from('rdv_commerciaux')
    .insert({
      prospect_id: pid,
      commercial_id: user.id,
      date_prevue: d.datePrevue,
      type_rdv: d.typeRdv ?? 'autre',
      format: d.format ?? null,
      lieu: d.lieu?.trim() || null,
      duree_min: d.dureeMin ?? null,
      participants_prospect: d.participantsProspect ?? [],
      participants_soluvia: d.participantsSoluvia ?? [],
      objet: d.objet?.trim() || null,
      notes: d.notes?.trim() || null,
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
    { type: d.typeRdv ?? 'autre' },
    user.id,
  );
  revalidatePath('/commercial/pipeline');
  revalidatePath(`/commercial/prospects/${pid}`);
  return { success: true, id: rdv.id };
}

export async function updateRdvCommercialStatut(
  id: string,
  statut: StatutRdv,
): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateRdvCommercialStatutSchema.safeParse({ id, statut });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const update: { statut: StatutRdv; date_realisee?: string | null } = {
    statut: parsed.data.statut,
  };
  if (parsed.data.statut === 'realise') {
    update.date_realisee = new Date().toISOString().slice(0, 10);
  } else if (
    parsed.data.statut === 'prevu' ||
    parsed.data.statut === 'reporte'
  ) {
    update.date_realisee = null;
  }

  const { error } = await supabase
    .from('rdv_commerciaux')
    .update(update)
    .eq('id', parsed.data.id);

  if (error) return { success: false, error: error.message };
  logAudit(
    'rdv_commercial_statut_updated',
    'rdv_commercial',
    parsed.data.id,
    { statut: parsed.data.statut },
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
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  id = parsed.data.id;

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const [{ data: existing }, { data: caller }] = await Promise.all([
    supabase
      .from('rdv_commerciaux')
      .select('commercial_id')
      .eq('id', id)
      .single(),
    supabase.from('users').select('role').eq('id', user.id).single(),
  ]);

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

export async function updateRdvCommercial(input: {
  id: string;
  datePrevue: string;
  typeRdv: TypeRdv;
  format: FormatRdv | null;
  lieu: string | null;
  dureeMin: number | null;
  statut: StatutRdv;
  participantsProspect: string[];
  participantsSoluvia: string[];
  objet: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateRdvCommercialSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const d = parsed.data;
  const { data: row, error } = await supabase
    .from('rdv_commerciaux')
    .update({
      date_prevue: d.datePrevue,
      type_rdv: d.typeRdv,
      format: d.format,
      lieu: d.lieu?.trim() || null,
      duree_min: d.dureeMin,
      statut: d.statut,
      date_realisee:
        d.statut === 'realise' ? new Date().toISOString().slice(0, 10) : null,
      participants_prospect: d.participantsProspect,
      participants_soluvia: d.participantsSoluvia,
      objet: d.objet?.trim() || null,
    })
    .eq('id', d.id)
    .select('prospect_id')
    .single();

  if (error) return { success: false, error: error.message };
  logAudit(
    'rdv_commercial_updated',
    'rdv_commercial',
    d.id,
    { statut: d.statut, type: d.typeRdv },
    user.id,
  );
  revalidatePath('/commercial/pipeline');
  if (row?.prospect_id) {
    revalidatePath(`/commercial/prospects/${row.prospect_id}`);
  }
  return { success: true };
}

export async function updateRdvCompteRendu(input: {
  id: string;
  compteRendu?: string | null;
  crFinalise?: boolean;
  gabaritVersion?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateRdvCrSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const d = parsed.data;
  const patch: {
    compte_rendu?: string | null;
    cr_finalise?: boolean;
    gabarit_version?: string | null;
  } = {};
  if (d.compteRendu !== undefined) patch.compte_rendu = d.compteRendu;
  if (d.crFinalise !== undefined) patch.cr_finalise = d.crFinalise;
  if (d.gabaritVersion !== undefined) patch.gabarit_version = d.gabaritVersion;

  const { data: row, error } = await supabase
    .from('rdv_commerciaux')
    .update(patch)
    .eq('id', d.id)
    .select('prospect_id')
    .single();

  if (error) return { success: false, error: error.message };
  logAudit(
    'rdv_commercial_cr_updated',
    'rdv_commercial',
    d.id,
    undefined,
    user.id,
  );
  if (row?.prospect_id) {
    revalidatePath(`/commercial/prospects/${row.prospect_id}`);
  }
  return { success: true };
}

export async function markRdvMailSent(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = RdvIdOnlySchema.safeParse({ id });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { data: row, error } = await supabase
    .from('rdv_commerciaux')
    .update({ mail_post_envoye_at: new Date().toISOString() })
    .eq('id', parsed.data.id)
    .select('prospect_id')
    .single();

  if (error) return { success: false, error: error.message };
  logAudit(
    'rdv_commercial_mail_sent',
    'rdv_commercial',
    parsed.data.id,
    undefined,
    user.id,
  );
  revalidatePath('/commercial/pipeline');
  if (row?.prospect_id) {
    revalidatePath(`/commercial/prospects/${row.prospect_id}`);
  }
  return { success: true };
}
