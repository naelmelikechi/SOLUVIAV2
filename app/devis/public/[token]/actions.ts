'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { getSession } from '@/lib/auth/session-shim';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { clientIpFromHeaders } from '@/lib/utils/request-id';

// Le token est une capability d'acces au devis : ne jamais le logguer en clair.
function tokenPrefix(token: string): string {
  return token.slice(0, 8) + '...';
}

export async function acceptDevisPublicAction(
  token: string,
  nom: string,
  email: string,
): Promise<{ success: true; ref: string } | { success: false; error: string }> {
  await getSession();
  // Endpoint public anonyme : rate limit par IP (fail-open si Upstash absent)
  const ip = clientIpFromHeaders(await headers());
  const rl = await checkRateLimit('devis-public-action', ip, {
    limit: 10,
    windowSeconds: 60,
  });
  if (rl.limited) {
    logger.warn('public.devis.accept', 'rate limit hit', {
      ip,
      token: tokenPrefix(token),
    });
    return {
      success: false,
      error: `Trop de tentatives. Réessayez dans ${rl.retryAfter}s.`,
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('accept_devis_public', {
    p_token: token,
    p_nom: nom,
    p_email: email,
  });
  if (error) {
    logger.warn('public.devis.accept', 'rpc error', {
      token: tokenPrefix(token),
      error: error.message,
    });
    return {
      success: false,
      error: "Impossible d'accepter le devis. Vérifiez vos informations.",
    };
  }
  const ref = (data as { ref: string }).ref;
  // declencher email confirmation async (non-bloquant)
  try {
    const { sendDevisAcceptationConfirmation } =
      await import('@/lib/email/devis-templates');
    const { data: devisRow } = await supabase
      .from('devis')
      .select('id')
      .eq('ref', ref)
      .single();
    if (devisRow)
      await sendDevisAcceptationConfirmation({
        devisId: devisRow.id,
        signataireEmail: email,
        signataireNom: nom,
      });
  } catch (e) {
    logger.warn(
      'public.devis.accept',
      'confirmation email failed (non-bloquant)',
      { error: e },
    );
  }
  return { success: true, ref };
}

export async function refuseDevisPublicAction(
  token: string,
  motif: string,
): Promise<{ success: true } | { success: false; error: string }> {
  await getSession();
  // Endpoint public anonyme : rate limit par IP (fail-open si Upstash absent)
  const ip = clientIpFromHeaders(await headers());
  const rl = await checkRateLimit('devis-public-action', ip, {
    limit: 10,
    windowSeconds: 60,
  });
  if (rl.limited) {
    logger.warn('public.devis.refuse', 'rate limit hit', {
      ip,
      token: tokenPrefix(token),
    });
    return {
      success: false,
      error: `Trop de tentatives. Réessayez dans ${rl.retryAfter}s.`,
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('refuse_devis_public', {
    p_token: token,
    p_motif: motif,
  });
  if (error) {
    logger.warn('public.devis.refuse', 'rpc error', {
      token: tokenPrefix(token),
      error: error.message,
    });
    return { success: false, error: 'Impossible de refuser le devis.' };
  }
  // notif admins (non-bloquant)
  try {
    const { notifyAdminsDevisRefuse } =
      await import('@/lib/email/devis-templates');
    const ref = (data as { ref: string }).ref;
    const { data: devisRow } = await supabase
      .from('devis')
      .select('id')
      .eq('ref', ref)
      .single();
    if (devisRow)
      await notifyAdminsDevisRefuse({ devisId: devisRow.id, motif });
  } catch (e) {
    logger.warn('public.devis.refuse', 'notif admins failed (non-bloquant)', {
      error: e,
    });
  }
  return { success: true };
}
