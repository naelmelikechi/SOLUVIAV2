import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveRP } from '@/lib/webauthn/config';
import { consumeChallenge } from '@/lib/webauthn/challenge-store';

interface VerifyBody {
  response: AuthenticationResponseJSON;
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('webauthn_session')?.value;
  if (!sessionId) {
    return NextResponse.json({ error: 'Session expirée' }, { status: 400 });
  }

  const stored = await consumeChallenge(sessionId, 'login');
  if (!stored) {
    return NextResponse.json({ error: 'Session invalide' }, { status: 400 });
  }

  const body = (await req.json()) as VerifyBody;
  const credentialId = body.response.id;

  const admin = createAdminClient();
  const { data: cred, error: credErr } = await admin
    .from('webauthn_credentials')
    .select('*')
    .eq('credential_id', credentialId)
    .maybeSingle();

  if (credErr || !cred) {
    return NextResponse.json({ error: 'Passkey inconnu' }, { status: 401 });
  }

  const { rpID, origin } = await resolveRP();

  const verification = await verifyAuthenticationResponse({
    response: body.response,
    expectedChallenge: stored.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: cred.credential_id,
      publicKey: new Uint8Array(Buffer.from(cred.public_key, 'base64url')),
      counter: Number(cred.counter),
      transports: (cred.transports ?? []) as AuthenticatorTransportFuture[],
    },
    requireUserVerification: false,
  });

  if (!verification.verified) {
    return NextResponse.json(
      { error: 'Vérification échouée' },
      { status: 401 },
    );
  }

  await admin
    .from('webauthn_credentials')
    .update({
      counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', cred.id);

  // Cree une session Supabase pour le user de la credential. On passe par
  // generateLink (magiclink) pour recuperer un email_otp puis verifyOtp,
  // qui declenche le set des cookies de session via @supabase/ssr.
  const { data: userResp, error: userErr } = await admin.auth.admin.getUserById(
    cred.user_id,
  );
  if (userErr || !userResp?.user?.email) {
    return NextResponse.json(
      { error: 'Utilisateur introuvable' },
      { status: 401 },
    );
  }

  const { data: linkData, error: linkErr } =
    await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: userResp.user.email,
    });
  if (linkErr || !linkData.properties.email_otp) {
    return NextResponse.json(
      { error: 'Échec création session' },
      { status: 500 },
    );
  }

  const supabase = await createClient();
  const { error: otpErr } = await supabase.auth.verifyOtp({
    type: 'email',
    email: userResp.user.email,
    token: linkData.properties.email_otp,
  });
  if (otpErr) {
    return NextResponse.json(
      { error: `Échec connexion: ${otpErr.message}` },
      { status: 500 },
    );
  }

  cookieStore.delete('webauthn_session');
  return NextResponse.json({ ok: true });
}
