'use server';

import { revalidatePath } from 'next/cache';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/guards';
import { env } from '@/lib/env';
import { logAudit } from '@/lib/utils/audit';
import {
  dailySeed,
  normalizeUnlockAttempt,
  resolveAvatarSeed,
  todayIso,
  type AvatarMode,
} from '@/lib/utils/avatar';

// ---------------------------------------------------------------------------
// Schemas Zod (validation cote serveur, defense en profondeur)
// ---------------------------------------------------------------------------

const UpdateProfileSchema = z.object({
  prenom: z
    .string()
    .trim()
    .min(1, 'Le prénom est requis')
    .max(100, 'Le prénom est trop long'),
  nom: z
    .string()
    .trim()
    .min(1, 'Le nom est requis')
    .max(100, 'Le nom est trop long'),
  // Telephone: nullable, format libre mais borné
  telephone: z
    .string()
    .trim()
    .max(32, 'Numéro de téléphone trop long')
    .nullable()
    .optional(),
});

const UpdatePasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .max(72, 'Le mot de passe est trop long (max 72 caractères)'),
});

const UnlockAttemptSchema = z.object({
  attempt: z
    .string()
    .min(1, 'Tentative requise')
    .max(256, 'Tentative trop longue'),
});

// ---------------------------------------------------------------------------
// updateProfile - update current user's prenom and nom
// ---------------------------------------------------------------------------

export async function updateProfile(
  prenom: string,
  nom: string,
  telephone: string | null,
): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateProfileSchema.safeParse({ prenom, nom, telephone });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  prenom = parsed.data.prenom;
  nom = parsed.data.nom;
  telephone = parsed.data.telephone ?? null;

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user: authUser } = auth;

  // Normalize: empty string → null (DB column is nullable).
  const tel = telephone?.trim() ? telephone.trim() : null;

  const { error } = await supabase
    .from('users')
    .update({ prenom, nom, telephone: tel })
    .eq('id', authUser.id);

  if (error) return { success: false, error: error.message };

  logAudit(
    'profile_updated',
    'user',
    undefined,
    {
      prenom,
      nom,
      telephone: tel,
    },
    authUser.id,
  );

  revalidatePath('/parametres-compte');
  revalidatePath('/equipe');
  return { success: true };
}

// ---------------------------------------------------------------------------
// updatePassword - change current user's password via Supabase Auth
// ---------------------------------------------------------------------------

export async function updatePassword(
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdatePasswordSchema.safeParse({ newPassword });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  newPassword = parsed.data.newPassword;

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) return { success: false, error: error.message };

  logAudit('password_changed', 'user', undefined, undefined, user.id);

  return { success: true };
}

// ---------------------------------------------------------------------------
// Avatar actions - modèle à 3 états (daily / random / frozen)
//
// État DB            avatar_mode  avatar_seed        avatar_regen_date
// ─────────────────  ───────────  ─────────────────  ─────────────────
// Quotidien          'daily'      (ignoré)           (persiste, rate-limit)
// Random du jour     'random'     <seed random>      <today>
// Figé               'frozen'     <seed figé>        (ignoré)
//
// Le random expire automatiquement au changement de jour via `resolveAvatarSeed`
// (redevient daily à l'affichage sans toucher à la DB).
// ---------------------------------------------------------------------------

type AvatarActionResult = {
  success: boolean;
  mode?: AvatarMode;
  seed?: string | null;
  regenDate?: string | null;
  error?: string;
};

/** Passe en mode quotidien. Le seed random éventuel est gardé en DB mais ignoré. */
export async function setAvatarDaily(): Promise<AvatarActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user: authUser } = auth;

  const { error } = await supabase
    .from('users')
    .update({ avatar_mode: 'daily', avatar_seed: null })
    .eq('id', authUser.id);

  if (error) return { success: false, error: error.message };

  logAudit(
    'avatar_mode_changed',
    'user',
    undefined,
    { mode: 'daily' },
    authUser.id,
  );

  revalidatePath('/parametres-compte');
  return { success: true, mode: 'daily', seed: null };
}

/** Tire un nouveau random. Rate-limit 1/jour (via avatar_regen_date). */
export async function rollRandomAvatar(): Promise<AvatarActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user: authUser } = auth;

  const { data: userData } = await supabase
    .from('users')
    .select('avatar_regen_date')
    .eq('id', authUser.id)
    .single();

  const today = todayIso();
  if (userData?.avatar_regen_date === today) {
    return {
      success: false,
      error: "Vous avez déjà tiré un robot aujourd'hui. Revenez demain !",
    };
  }

  const seed = `${authUser.email}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const { error } = await supabase
    .from('users')
    .update({
      avatar_mode: 'random',
      avatar_seed: seed,
      avatar_regen_date: today,
    })
    .eq('id', authUser.id);

  if (error) return { success: false, error: error.message };

  logAudit('avatar_random_rolled', 'user', undefined, { seed }, authUser.id);

  revalidatePath('/parametres-compte');
  return { success: true, mode: 'random', seed, regenDate: today };
}

/**
 * Fige l'avatar actuellement visible (celui du jour si daily, le random si random).
 * Idempotent si déjà figé.
 */
export async function freezeCurrentAvatar(): Promise<AvatarActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user: authUser } = auth;
  if (!authUser.email) return { success: false, error: 'Non authentifié' };

  const { data: userData } = await supabase
    .from('users')
    .select('avatar_mode, avatar_seed, avatar_regen_date')
    .eq('id', authUser.id)
    .single();

  // Résout le seed actuellement affiché (gère l'expiry du random).
  const { seed } = resolveAvatarSeed({
    email: authUser.email,
    mode: (userData?.avatar_mode as AvatarMode | null) ?? 'daily',
    seed: userData?.avatar_seed ?? null,
    regenDate: userData?.avatar_regen_date ?? null,
  });

  // Si le seed résolu est identique à un daily seed frais, on fige quand même
  // avec ce seed précis pour que l'avatar reste constant.
  const seedToFreeze = seed ?? dailySeed(authUser.email);

  const { error } = await supabase
    .from('users')
    .update({ avatar_mode: 'frozen', avatar_seed: seedToFreeze })
    .eq('id', authUser.id);

  if (error) return { success: false, error: error.message };

  logAudit(
    'avatar_frozen',
    'user',
    undefined,
    { seed: seedToFreeze },
    authUser.id,
  );

  revalidatePath('/parametres-compte');
  return { success: true, mode: 'frozen', seed: seedToFreeze };
}

/**
 * Easter-egg: try to unlock a frozen avatar by entering a secret string.
 * The secret is stored in env.AVATAR_UNLOCK_SECRET and is never exposed to
 * the client. Compared with a timing-safe equal so the check doesn't leak
 * information through response time.
 *
 * There is no hint. There is no recovery. It is impossible to guess.
 */
export async function attemptUnlockFrozenAvatar(
  attempt: string,
): Promise<AvatarActionResult> {
  const parsed = UnlockAttemptSchema.safeParse({ attempt });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  attempt = parsed.data.attempt;

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user: authUser } = auth;

  const expected = env.AVATAR_UNLOCK_SECRET;
  if (!expected) {
    // Intentionally vague — same message whether secret is misconfigured or wrong.
    return {
      success: false,
      error: 'Ce n\u2019est pas ça. Continue à chercher.',
    };
  }

  // Normalise les deux côtés (casse, accents, ponctuation) pour une saisie
  // tolérante, puis compare en timing-safe sur les formes normalisées.
  const a = Buffer.from(normalizeUnlockAttempt(attempt));
  const b = Buffer.from(normalizeUnlockAttempt(expected));
  const matches =
    b.length > 0 && a.length === b.length && timingSafeEqual(a, b);

  logAudit(
    'avatar_unlock_attempted',
    'user',
    undefined,
    {
      success: matches,
      attempt_length: attempt.length,
    },
    authUser.id,
  );

  if (!matches) {
    return {
      success: false,
      error: 'Ce n\u2019est pas ça. Continue à chercher.',
    };
  }

  const { error } = await supabase
    .from('users')
    .update({ avatar_mode: 'daily', avatar_seed: null })
    .eq('id', authUser.id);

  if (error) return { success: false, error: error.message };

  logAudit('avatar_unlocked', 'user', undefined, undefined, authUser.id);

  revalidatePath('/parametres-compte');
  return { success: true, mode: 'daily', seed: null };
}
