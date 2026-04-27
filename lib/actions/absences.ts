// lib/actions/absences.ts
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
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

function validate(data: AbsenceData): string | null {
  if (data.type !== 'conges' && data.type !== 'maladie') {
    return 'Type d absence invalide';
  }
  if (!data.date_debut || !data.date_fin) {
    return 'Dates requises';
  }
  if (data.date_fin < data.date_debut) {
    return 'La date de fin doit etre apres la date de debut';
  }
  if (
    data.date_debut === data.date_fin &&
    data.demi_jour_debut &&
    data.demi_jour_fin
  ) {
    return 'Un seul jour ne peut pas etre demi-journee aux deux bornes';
  }
  return null;
}

export async function createAbsenceAction(
  data: AbsenceData,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const err = validate(data);
  if (err) return { success: false, error: err };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifie' };

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

  logAudit('absence_created', 'absence', created.id);
  revalidatePath('/temps');

  return { success: true, id: created.id };
}

export async function updateAbsenceAction(
  id: string,
  data: AbsenceData,
): Promise<{ success: boolean; error?: string }> {
  const err = validate(data);
  if (err) return { success: false, error: err };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifie' };

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

  logAudit('absence_updated', 'absence', id);
  revalidatePath('/temps');

  return { success: true };
}

export async function deleteAbsenceAction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifie' };

  const { error } = await supabase.from('absences').delete().eq('id', id);

  if (error) {
    logger.error('actions.absences', 'delete failed', { id, error });
    return { success: false, error: error.message };
  }

  logAudit('absence_deleted', 'absence', id);
  revalidatePath('/temps');

  return { success: true };
}
