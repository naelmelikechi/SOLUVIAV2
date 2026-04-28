import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { resolveRP } from '@/lib/webauthn/config';
import { saveChallenge } from '@/lib/webauthn/challenge-store';
import { env } from '@/lib/env';

export async function POST() {
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
