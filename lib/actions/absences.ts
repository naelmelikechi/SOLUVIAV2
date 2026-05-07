// lib/actions/absences.ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/guards';
import { logAudit } from '@/lib/utils/audit';
import { logger } from '@/lib/utils/logger';
import type { AbsenceType } from '@/lib/utils/absences';

interface AbsenceData {
  type: AbsenceType;
  date_debut: string;
  date_fin: string;
  demi_jour_debut?: boolean;
  demi_jour_fin?: boolean;
}

// ---------------------------------------------------------------------------
// Schemas Zod (validation cote serveur, defense en profondeur)
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const AbsenceDataSchema = z
  .object({
    type: z.enum(['conges', 'maladie']),
    date_debut: z
      .string()
      .regex(ISO_DATE_RE, 'Date au format YYYY-MM-DD requise'),
    date_fin: z
      .string()
      .regex(ISO_DATE_RE, 'Date au format YYYY-MM-DD requise'),
    demi_jour_debut: z.boolean().optional(),
    demi_jour_fin: z.boolean().optional(),
  })
  .refine((d) => d.date_fin >= d.date_debut, {
    message: 'La date de fin doit etre apres la date de debut',
    path: ['date_fin'],
  })
  .refine(
    (d) =>
      !(
        d.date_debut === d.date_fin &&
        d.demi_jour_debut === true &&
        d.demi_jour_fin === true
      ),
    {
      message: 'Un seul jour ne peut pas etre demi-journee aux deux bornes',
    },
  );

const absenceIdSchema = z.string().uuid('Absence ID doit etre un UUID');

const UpdateAbsenceSchema = z.object({
  id: absenceIdSchema,
  data: AbsenceDataSchema,
});

const DeleteAbsenceSchema = z.object({ id: absenceIdSchema });

export async function createAbsenceAction(
  data: AbsenceData,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const parsed = AbsenceDataSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }
  data = parsed.data;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // Chevauchement
  const { data: overlap } = await supabase
    .from('absences')
    .select('id')
    .eq('user_id', user.id)
    .lte('date_debut', data.date_fin)
    .gte('date_fin', data.date_debut)
    .limit(1);

  if (overlap && overlap.length > 0) {
    return {
      success: false,
      error: 'Une absence existe deja sur cette periode',
    };
  }

  const { data: created, error } = await supabase
    .from('absences')
    .insert({
      user_id: user.id,
      type: data.type,
      date_debut: data.date_debut,
      date_fin: data.date_fin,
      demi_jour_debut: data.demi_jour_debut ?? false,
      demi_jour_fin: data.demi_jour_fin ?? false,
    })
    .select('id')
    .single();

  if (error) {
    logger.error('actions.absences', 'create failed', { error });
    return { success: false, error: error.message };
  }

  logAudit('absence_created', 'absence', created.id, undefined, user.id);
  revalidatePath('/temps');

  return { success: true, id: created.id };
}

export async function updateAbsenceAction(
  id: string,
  data: AbsenceData,
): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateAbsenceSchema.safeParse({ id, data });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }
  id = parsed.data.id;
  data = parsed.data.data;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // Chevauchement (en excluant l absence elle-meme)
  const { data: overlap } = await supabase
    .from('absences')
    .select('id')
    .eq('user_id', user.id)
    .neq('id', id)
    .lte('date_debut', data.date_fin)
    .gte('date_fin', data.date_debut)
    .limit(1);

  if (overlap && overlap.length > 0) {
    return {
      success: false,
      error: 'Une autre absence existe deja sur cette periode',
    };
  }

  const { error } = await supabase
    .from('absences')
    .update({
      type: data.type,
      date_debut: data.date_debut,
      date_fin: data.date_fin,
      demi_jour_debut: data.demi_jour_debut ?? false,
      demi_jour_fin: data.demi_jour_fin ?? false,
    })
    .eq('id', id);

  if (error) {
    logger.error('actions.absences', 'update failed', { id, error });
    return { success: false, error: error.message };
  }

  logAudit('absence_updated', 'absence', id, undefined, user.id);
  revalidatePath('/temps');

  return { success: true };
}

export async function deleteAbsenceAction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = DeleteAbsenceSchema.safeParse({ id });
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

  const { error } = await supabase.from('absences').delete().eq('id', id);

  if (error) {
    logger.error('actions.absences', 'delete failed', { id, error });
    return { success: false, error: error.message };
  }

  logAudit('absence_deleted', 'absence', id, undefined, user.id);
  revalidatePath('/temps');

  return { success: true };
}
