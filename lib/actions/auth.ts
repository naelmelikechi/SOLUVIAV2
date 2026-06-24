'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { logger } from '@/lib/utils/logger';
import { getRequestId, clientIpFromHeaders } from '@/lib/utils/request-id';
import { getSession } from '@/lib/auth/session-shim';

// Auth actions server-side. Le login etait fait client-side, ce qui rendait
// impossible le rate limit (l'appel sortait directement vers Supabase). On
// passe par une Server Action qui gate l'appel derriere un Upstash ratelimit
// (fail-open si non configure).

async function getClientIp(): Promise<string> {
  return clientIpFromHeaders(await headers());
}

function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function loginAction(
  _prevState: unknown,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  await getSession();
  const email = normaliseEmail(String(formData.get('email') ?? ''));
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { success: false, error: 'Email et mot de passe sont requis.' };
  }

  const [ip, requestId] = await Promise.all([getClientIp(), getRequestId()]);
  // Limite combinee IP+email pour ne pas bloquer un bureau partage sur un
  // seul email tape, tout en empechant un balayage par un attaquant.
  const limit = await checkRateLimit('login', `${ip}:${email}`, {
    limit: 5,
    windowSeconds: 5 * 60,
  });
  if (limit.limited) {
    logger.warn('actions.auth', 'login rate limit hit', {
      ip,
      email,
      requestId,
    });
    return {
      success: false,
      error: `Trop de tentatives. Réessayez dans ${limit.retryAfter}s.`,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // On log cote serveur mais on renvoie un message generique pour ne pas
    // differencier "email inconnu" de "mauvais mot de passe".
    logger.info('actions.auth', 'login failure', {
      email,
      code: error.code,
      requestId,
    });
    return { success: false, error: 'Identifiants invalides.' };
  }

  // Verifier que le compte n'est pas desactive. Si oui, on signe out la
  // session qui vient d etre creee et on remonte un message clair.
  if (data.user) {
    const { data: profile } = await supabase
      .from('users')
      .select('actif')
      .eq('id', data.user.id)
      .single();
    if (!profile || profile.actif === false) {
      await supabase.auth.signOut();
      logger.info('actions.auth', 'login refused (disabled account)', {
        email,
        requestId,
      });
      return {
        success: false,
        error: 'Votre compte a été désactivé. Contactez un administrateur.',
      };
    }
  }

  return { success: true };
}

/**
 * Origine serveur de l'app, utilisee pour les redirectTo Supabase Auth.
 * On ne fait JAMAIS confiance a une origin postee par le client (vecteur
 * de phishing : un attaquant pourrait rediriger le code OAuth vers un
 * domaine qu'il controle). Voir audit I3.
 */
function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  // Fallback local dev. En prod NEXT_PUBLIC_SITE_URL doit etre defini.
  return 'http://localhost:3000';
}

export async function requestPasswordResetAction(
  _prevState: unknown,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  await getSession();
  const email = normaliseEmail(String(formData.get('email') ?? ''));

  if (!email) {
    return { success: false, error: "L'email est requis." };
  }

  const [ip, requestId] = await Promise.all([getClientIp(), getRequestId()]);
  const limit = await checkRateLimit('password-reset', `${ip}:${email}`, {
    limit: 3,
    windowSeconds: 60 * 60,
  });
  if (limit.limited) {
    // Toujours repondre success pour ne pas reveler l'existence d'un email
    // (enumeration). Le rate limit lui-meme n'expose pas cette info.
    logger.warn('actions.auth', 'password reset rate limit hit', {
      ip,
      email,
      requestId,
    });
    return { success: true };
  }

  const supabase = await createClient();
  const redirectTo = `${getSiteUrl()}/api/auth/callback`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    logger.error('actions.auth', 'password reset failed', {
      email,
      code: error.code,
      requestId,
    });
    // Reponse neutre: on ne revele pas si l'email existe.
    return { success: true };
  }

  return { success: true };
}
