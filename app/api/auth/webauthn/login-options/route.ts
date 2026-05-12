import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { resolveRP } from '@/lib/webauthn/config';
import { saveChallenge } from '@/lib/webauthn/challenge-store';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { logger } from '@/lib/utils/logger';
import { env } from '@/lib/env';

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export async function POST(req: Request) {
  // Route anonyme : un attaquant peut spammer pour saturer Redis (challenges
  // store) ou tenter une enumeration via timing. Limite IP-based defensive.
  const ip = getClientIp(req);
  const rl = await checkRateLimit('webauthn-login-options', ip, {
    limit: 20,
    windowSeconds: 5 * 60,
  });
  if (rl.limited) {
    logger.warn('webauthn.login-options', 'rate limit hit', { ip });
    return NextResponse.json(
      { error: `Trop de tentatives. Réessayez dans ${rl.retryAfter ?? 60}s.` },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfter ?? 60) },
      },
    );
  }

  const { rpID } = await resolveRP();

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    // Pas de allowCredentials -> discoverable login: l'authenticator
    // presente la liste des passkeys disponibles pour ce RP.
  });

  const sessionId = randomUUID();
  await saveChallenge(sessionId, 'login', options.challenge);

  const cookieStore = await cookies();
  cookieStore.set('webauthn_session', sessionId, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 300,
    path: '/',
  });

  return NextResponse.json(options);
}
