'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { checkAuth } from '@/lib/auth/guards';
import { logAudit } from '@/lib/utils/audit';
import { logger } from '@/lib/utils/logger';

const SOLUVIA_INTERNAL_CLIENT_ID = '00000000-0000-0000-0000-0000000000ff';
const TYPOLOGIE_INTERNE_ID = '00000000-0000-0000-0000-00000000aaff';

const CodeSchema = z
  .string()
  .trim()
  .min(2, 'Code trop court')
  .max(40, 'Code trop long')
  .regex(
    /^[a-z][a-z0-9_]+$/,
    'Code : lettres minuscules, chiffres, _ uniquement',
  );

const LibelleSchema = z
  .string()
  .trim()
  .min(2, 'Libellé requis')
  .max(80, 'Libellé trop long');

const CreateSchema = z.object({
  code: CodeSchema,
  libelle: LibelleSchema,
  ordre: z.coerce.number().int().min(0).max(999).default(0),
});

const UpdateSchema = z.object({
  libelle: LibelleSchema.optional(),
  ordre: z.coerce.number().int().min(0).max(999).optional(),
  actif: z.boolean().optional(),
});

type ActionResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string };

function buildRef(code: string): string {
  // Pattern coherent avec le seed existant: 9001-INT-FOR, 9002-INT-IXC, etc.
  const suffix = code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3);
  return `INT-${suffix}-${Date.now().toString().slice(-6)}`;
}

export async function createCategorieInterneAction(input: {
  code: string;
  libelle: string;
  ordre?: number;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // 1. Insert categorie
  const { data: cat, error: catErr } = await supabase
    .from('categories_internes')
    .insert({
      code: parsed.data.code,
      libelle: parsed.data.libelle,
      ordre: parsed.data.ordre,
    })
    .select('id')
    .single();

  if (catErr) {
    if (catErr.code === '23505') {
      return { success: false, error: 'Ce code est déjà utilisé' };
    }
    logger.error('actions.projets-internes', 'create categorie failed', {
      error: catErr,
    });
    return { success: false, error: catErr.message };
  }

  // 2. Insert projet associe
  const ref = buildRef(parsed.data.code);
  const { error: projetErr } = await supabase.from('projets').insert({
    ref,
    client_id: SOLUVIA_INTERNAL_CLIENT_ID,
    typologie_id: TYPOLOGIE_INTERNE_ID,
    statut: 'actif',
    archive: false,
    est_interne: true,
    categorie_interne_id: cat.id,
    taux_commission: 0,
  });

  if (projetErr) {
    logger.error('actions.projets-internes', 'create projet failed', {
      error: projetErr,
    });
    // Rollback : supprime la categorie pour eviter l'orphelin
    await supabase.from('categories_internes').delete().eq('id', cat.id);
    return { success: false, error: projetErr.message };
  }

  logAudit(
    'categorie_interne_created',
    'categorie_interne',
    cat.id,
    { code: parsed.data.code, libelle: parsed.data.libelle },
    user.id,
  );

  revalidatePath('/projets/internes');
  return { success: true, data: { id: cat.id } };
}

export async function updateCategorieInterneAction(
  id: string,
  input: { libelle?: string; ordre?: number; actif?: boolean },
): Promise<ActionResult> {
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const update: {
    libelle?: string;
    ordre?: number;
    actif?: boolean;
  } = {};
  if (parsed.data.libelle !== undefined) update.libelle = parsed.data.libelle;
  if (parsed.data.ordre !== undefined) update.ordre = parsed.data.ordre;
  if (parsed.data.actif !== undefined) update.actif = parsed.data.actif;

  if (Object.keys(update).length === 0) {
    return { success: false, error: 'Aucune modification' };
  }

  const { error } = await supabase
    .from('categories_internes')
    .update(update)
    .eq('id', id);

  if (error) {
    logger.error('actions.projets-internes', 'update categorie failed', {
      error,
    });
    return { success: false, error: error.message };
  }

  logAudit(
    'categorie_interne_updated',
    'categorie_interne',
    id,
    update as Record<string, string | number | boolean>,
    user.id,
  );

  revalidatePath('/projets/internes');
  return { success: true };
}

export async function archiveCategorieInterneAction(
  id: string,
  unarchive: boolean = false,
): Promise<ActionResult<{ blocked?: boolean; recentSaisies?: number }>> {
  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  if (!unarchive) {
    // Garde-fou : refuser l'archive s'il y a eu des saisies < 30j sur le
    // projet associe (on previent l'admin via warning, mais on autorise).
    const days30Ago = new Date();
    days30Ago.setDate(days30Ago.getDate() - 30);
    const days30Iso = days30Ago.toISOString().split('T')[0]!;

    const { data: projet } = await supabase
      .from('projets')
      .select('id')
      .eq('est_interne', true)
      .eq('categorie_interne_id', id)
      .maybeSingle();

    if (projet) {
      const { count } = await supabase
        .from('saisies_temps')
        .select('id', { count: 'exact', head: true })
        .eq('projet_id', projet.id)
        .gte('date', days30Iso);

      if ((count ?? 0) > 0) {
        return {
          success: true,
          data: { blocked: false, recentSaisies: count ?? 0 },
        };
      }
    }
  }

  // Archive (ou desarchive) la categorie ET le projet associe
  const newArchive = !unarchive;
  const [catRes, projetRes] = await Promise.all([
    supabase
      .from('categories_internes')
      .update({ archive: newArchive, actif: !newArchive })
      .eq('id', id),
    supabase
      .from('projets')
      .update({
        archive: newArchive,
        statut: newArchive ? 'archive' : 'actif',
      })
      .eq('est_interne', true)
      .eq('categorie_interne_id', id),
  ]);

  if (catRes.error) {
    logger.error('actions.projets-internes', 'archive categorie failed', {
      error: catRes.error,
    });
    return { success: false, error: catRes.error.message };
  }
  if (projetRes.error) {
    logger.error('actions.projets-internes', 'archive projet failed', {
      error: projetRes.error,
    });
    return { success: false, error: projetRes.error.message };
  }

  logAudit(
    newArchive ? 'categorie_interne_archived' : 'categorie_interne_unarchived',
    'categorie_interne',
    id,
    undefined,
    user.id,
  );

  revalidatePath('/projets/internes');
  return { success: true };
}
