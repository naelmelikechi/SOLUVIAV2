'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';

const SCOPE = 'actions.qualiopi';

const AssignIndicatorSchema = z.object({
  clientId: z.string().uuid('Client ID doit etre un UUID'),
  campusId: z.number().int().positive(),
  indicatorId: z.number().int().positive(),
  userId: z.string().uuid().nullable(),
});

// ---------------------------------------------------------------------------
// Assignation responsable d'un indicateur (cote SOLUVIA)
// ---------------------------------------------------------------------------

export async function assignIndicatorResponsible(params: {
  clientId: string;
  campusId: number;
  indicatorId: number;
  userId: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const parsed = AssignIndicatorSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase.from('qualite_assignments').upsert(
    {
      client_id: parsed.data.clientId,
      campus_id: parsed.data.campusId,
      indicator_id: parsed.data.indicatorId,
      user_id: parsed.data.userId,
      created_by: user.id,
    },
    { onConflict: 'campus_id,indicator_id' },
  );
  if (error) {
    logger.error(SCOPE, 'assignIndicatorResponsible failed', { error });
    return { success: false, error: error.message };
  }
  logAudit(
    'qualiopi_assignment',
    'qualite_assignments',
    undefined,
    {
      indicator_id: parsed.data.indicatorId,
      user_id: parsed.data.userId,
    },
    user.id,
  );
  revalidatePath(`/qualiopi`);
  return { success: true };
}

// L'API Eduvia est consommee en lecture seule cote SOLUVIA : aucun upload
// d'evidence ni validation/rejet ne sont possibles depuis ici. Le depot et
// la validation des preuves Qualiopi se font dans Eduvia.
