'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { logger } from '@/lib/utils/logger';

// Auth actions server-side. Le login etait fait client-side, ce qui rendait
// impossible le rate limit (l'appel sortait directement vers Supabase). On
// passe par une Server Action qui gate l'appel derriere un Upstash ratelimit
// (fail-open si non configure).

async function getClientIp(): Promise<string> {
  const h = await headers();
  // Vercel injecte x-forwarded-for; premier segment = IP du client reel.
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  return h.get('x-real-ip') ?? 'unknown';
}

function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function loginAction(
  _prevState: unknown,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const email = normaliseEmail(String(formData.get('email') ?? ''));
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { success: false, error: 'Email et mot de passe sont requis.' };
  }

  const ip = await getClientIp();
  // Limite combinee IP+email pour ne pas bloquer un bureau partage sur un
  // seul email tape, tout en empechant un balayage par un attaquant.
  const limit = await checkRateLimit('login', `${ip}:${email}`, {
    limit: 5,
    windowSeconds: 5 * 60,
  });
  if (limit.limited) {
    logger.warn('actions.auth', 'login rate limit hit', { ip, email });
    return {
      success: false,
      error: `Trop de tentatives. Reessayez dans ${limit.retryAfter}s.`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // On log cote serveur mais on renvoie un message generique pour ne pas
    // differencier "email inconnu" de "mauvais mot de passe".
    logger.info('actions.auth', 'login failure', {
      email,
      code: error.code,
    });
    return { success: false, error: 'Identifiants invalides.' };
  }

  return { success: true };
}

export async function requestPasswordResetAction(
  _prevState: unknown,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const email = normaliseEmail(String(formData.get('email') ?? ''));
  const origin = String(formData.get('origin') ?? '');

  if (!email) {
    return { success: false, error: "L'email est requis." };
  }

  const ip = await getClientIp();
  const limit = await checkRateLimit('password-reset', `${ip}:${email}`, {
    limit: 3,
    windowSeconds: 60 * 60,
  });
  if (limit.limited) {
    // Toujours repondre success pour ne pas reveler l'existence d'un email
    // (enumeration). Le rate limit lui-meme n'expose pas cette info.
    logger.warn('actions.auth', 'password reset rate limit hit', { ip, email });
    return { success: true };
  }

  const supabase = await createClient();
  const redirectTo = origin
    ? `${origin}/api/auth/callback`
    : '/api/auth/callback';
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    logger.error('actions.auth', 'password reset failed', {
      email,
      code: error.code,
    });
    // Reponse neutre: on ne revele pas si l'email existe.
    return { success: true };
  }

  return { success: true };
}
