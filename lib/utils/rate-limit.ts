import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';

// Rate limiter pour les endpoints sensibles (login, password reset).
//
// Si UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN ne sont pas
// configures, la fonction retourne {limited:false}: on prefere degrader
// la protection plutot que de bloquer l'authentification en cas de
// Redis indisponible. A brancher sur une instance Upstash (integration
// Vercel Marketplace) en prod pour activer effectivement la limite.

type LimiterKey = 'login' | 'password-reset';

function buildLimiter(
  key: LimiterKey,
  limit: number,
  windowSeconds: number,
): Ratelimit | null {
  const url = env.UPSTASH_REDIS_REST_KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
  if (!url || !token) return null;

  const redis = new Redis({ url, token });

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    analytics: false,
    prefix: `soluvia:ratelimit:${key}`,
  });
}

// Instanciees a la demande pour eviter de construire un client Redis quand
// les env vars ne sont pas presentes (et eviter des alertes de connexion).
const limiters = new Map<LimiterKey, Ratelimit | null>();

function getLimiter(
  key: LimiterKey,
  limit: number,
  windowSeconds: number,
): Ratelimit | null {
  if (!limiters.has(key)) {
    limiters.set(key, buildLimiter(key, limit, windowSeconds));
  }
  return limiters.get(key) ?? null;
}

export interface RateLimitResult {
  limited: boolean;
  retryAfter?: number;
}

/**
 * Verifie le rate limit pour une cle donnee (typiquement l'IP du client
 * combinee avec l'email entre). Fail-open: si Redis est hors service ou
 * non configure, on autorise l'appel.
 */
export async function checkRateLimit(
  key: LimiterKey,
  identifier: string,
  opts: { limit: number; windowSeconds: number },
): Promise<RateLimitResult> {
  const limiter = getLimiter(key, opts.limit, opts.windowSeconds);
  if (!limiter) return { limited: false };

  try {
    const { success, reset } = await limiter.limit(identifier);
    if (success) return { limited: false };
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return { limited: true, retryAfter };
  } catch {
    // Indisponibilite Upstash: on ne casse pas l'auth.
    return { limited: false };
  }
}
