import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveRP } from '@/lib/webauthn/config';
import { saveChallenge } from '@/lib/webauthn/challenge-store';
import { env } from '@/lib/env';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
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
