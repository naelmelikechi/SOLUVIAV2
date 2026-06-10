'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkAuth } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';

const CodeSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Z][A-Z0-9_]*$/,
    'Code doit etre en majuscules (lettres, chiffres, _)',
  )
  .max(50);

const IdccSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{1,4}$/, 'IDCC doit etre 1 à 4 chiffres')
  .transform((s) => s.padStart(4, '0'));

const CreateOpcoSchema = z.object({
  code: CodeSchema,
  nom: z.string().trim().min(1, 'Nom requis').max(200),
  idccCodes: z.array(IdccSchema).min(1, 'Au moins un IDCC requis'),
});

const UpdateOpcoSchema = z.object({
  id: z.string().uuid(),
  code: CodeSchema,
  nom: z.string().trim().min(1).max(200),
  idccCodes: z.array(IdccSchema).min(1),
});

async function checkIdccCollision(
  supabase: SupabaseClient,
  idccCodes: string[],
  excludeId?: string,
): Promise<{ ok: boolean; conflict?: string }> {
  const baseQuery = supabase
    .from('opcos')
    .select('id, code, idcc_codes')
    .eq('actif', true)
    .overlaps('idcc_codes', idccCodes);
  const { data, error } = excludeId
    ? await baseQuery.neq('id', excludeId)
    : await baseQuery;
  if (error) {
    logger.error('actions.opcos', 'checkIdccCollision failed', { error });
    return { ok: false, conflict: 'Erreur de validation' };
  }
  if (data && data.length > 0) {
    const conflictCodes = data.map((r) => r.code as string).join(', ');
    return {
      ok: false,
      conflict: `IDCC déjà utilisé par : ${conflictCodes}`,
    };
  }
  return { ok: true };
}

export async function createOpco(input: {
  code: string;
  nom: string;
  idccCodes: string[];
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const parsed = CreateOpcoSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message };
  }

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const dedup = Array.from(new Set(parsed.data.idccCodes));
  const collision = await checkIdccCollision(supabase, dedup);
  if (!collision.ok) return { success: false, error: collision.conflict };

  const { data, error } = await supabase
    .from('opcos')
    .insert({
      code: parsed.data.code,
      nom: parsed.data.nom,
      idcc_codes: dedup,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };

  logAudit(
    'opco_created',
    'opco',
    data.id,
    { code: parsed.data.code, idcc: dedup },
    user.id,
  );
  revalidatePath('/admin/parametres/opcos');
  return { success: true, id: data.id };
}

export async function updateOpco(input: {
  id: string;
  code: string;
  nom: string;
  idccCodes: string[];
}): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateOpcoSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message };
  }

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const dedup = Array.from(new Set(parsed.data.idccCodes));
  const collision = await checkIdccCollision(supabase, dedup, parsed.data.id);
  if (!collision.ok) return { success: false, error: collision.conflict };

  const { error } = await supabase
    .from('opcos')
    .update({
      code: parsed.data.code,
      nom: parsed.data.nom,
      idcc_codes: dedup,
    })
    .eq('id', parsed.data.id);

  if (error) return { success: false, error: error.message };

  logAudit(
    'opco_updated',
    'opco',
    parsed.data.id,
    { code: parsed.data.code, idcc: dedup },
    user.id,
  );
  revalidatePath('/admin/parametres/opcos');
  return { success: true };
}

export async function archiveOpco(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('opcos')
    .update({ actif: false })
    .eq('id', id);
  if (error) return { success: false, error: error.message };

  logAudit('opco_archived', 'opco', id, {}, user.id);
  revalidatePath('/admin/parametres/opcos');
  return { success: true };
}

export async function unarchiveOpco(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // Re-verifier collision sur les IDCC (un autre OPCO a pu les prendre entre-temps)
  const { data: opco, error: fetchErr } = await supabase
    .from('opcos')
    .select('idcc_codes')
    .eq('id', id)
    .single();
  if (fetchErr || !opco) return { success: false, error: 'OPCO introuvable' };

  const collision = await checkIdccCollision(supabase, opco.idcc_codes, id);
  if (!collision.ok) return { success: false, error: collision.conflict };

  const { error } = await supabase
    .from('opcos')
    .update({ actif: true })
    .eq('id', id);
  if (error) return { success: false, error: error.message };

  logAudit('opco_unarchived', 'opco', id, {}, user.id);
  revalidatePath('/admin/parametres/opcos');
  return { success: true };
}
