import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveRP } from '@/lib/webauthn/config';
import { consumeChallenge } from '@/lib/webauthn/challenge-store';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { logger } from '@/lib/utils/logger';

interface VerifyBody {
  response: RegistrationResponseJSON;
  deviceName?: string;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  }

  // Limite par user.id : symmetric avec register-options, evite spam d'inserts
  // dans webauthn_credentials par un compte compromis.
  const rl = await checkRateLimit('webauthn-register-verify', user.id, {
    limit: 10,
    windowSeconds: 5 * 60,
  });
  if (rl.limited) {
    logger.warn('webauthn.register-verify', 'rate limit hit', {
      userId: user.id,
    });
    return NextResponse.json(
      { error: `Trop de tentatives. Réessayez dans ${rl.retryAfter ?? 60}s.` },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfter ?? 60) },
      },
    );
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get('webauthn_session')?.value;
  if (!sessionId) {
    return NextResponse.json({ error: 'Session expirée' }, { status: 400 });
  }

  const stored = await consumeChallenge(sessionId, 'register');
  if (!stored || stored.meta.userId !== user.id) {
    return NextResponse.json({ error: 'Session invalide' }, { status: 400 });
  }

  const body = (await req.json()) as VerifyBody;
  const { rpID, origin } = await resolveRP();

  const verification = await verifyRegistrationResponse({
    response: body.response,
    expectedChallenge: stored.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json(
      { error: 'Vérification échouée' },
      { status: 400 },
    );
  }

  const info = verification.registrationInfo;
  const publicKeyB64 = Buffer.from(info.credential.publicKey).toString(
    'base64url',
  );

  const admin = createAdminClient();
  const { error } = await admin.from('webauthn_credentials').insert({
    user_id: user.id,
    credential_id: info.credential.id,
    public_key: publicKeyB64,
    counter: info.credential.counter,
    transports: info.credential.transports ?? null,
    device_name: body.deviceName?.trim() || 'Passkey',
    backed_up: info.credentialBackedUp,
    device_type: info.credentialDeviceType,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  cookieStore.delete('webauthn_session');
  return NextResponse.json({ ok: true });
}
