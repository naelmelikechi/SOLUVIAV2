import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveRP } from '@/lib/webauthn/config';
import { saveChallenge } from '@/lib/webauthn/challenge-store';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { logger } from '@/lib/utils/logger';
import { env } from '@/lib/env';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  }

  // Limite par user.id : empeche un compte compromis de spammer le store de
  // challenges et d enregistrer des dizaines de credentials non desires.
  const rl = await checkRateLimit('webauthn-register-options', user.id, {
    limit: 10,
    windowSeconds: 5 * 60,
  });
  if (rl.limited) {
    logger.warn('webauthn.register-options', 'rate limit hit', {
      userId: user.id,
    });
    return NextResponse.json(
      { error: `Trop de tentatives. Reessayez dans ${rl.retryAfter ?? 60}s.` },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfter ?? 60) },
      },
    );
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('webauthn_credentials')
    .select('credential_id, transports')
    .eq('user_id', user.id);

  const { rpID, rpName } = await resolveRP();

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email ?? user.id,
    userID: new TextEncoder().encode(user.id),
    userDisplayName: user.email ?? '',
    attestationType: 'none',
    excludeCredentials: (existing ?? []).map((c) => ({
      id: c.credential_id,
      transports: (c.transports ?? []) as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  const sessionId = randomUUID();
  await saveChallenge(sessionId, 'register', options.challenge, {
    userId: user.id,
  });

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
