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
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { logger } from '@/lib/utils/logger';

interface VerifyBody {
  response: AuthenticationResponseJSON;
}

/** Extrait l IP client depuis les headers Vercel (x-forwarded-for premier segment). */
function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export async function POST(req: Request) {
  // Rate limit avant tout : empeche le brute force sur des credentialId
  // (assertions WebAuthn de bonne forme mais credentialId invente). Cle
  // par IP uniquement car aucun email n est connu a ce stade.
  // Budget : 10 tentatives par IP / 5 min - laxiste pour les vrais
  // utilisateurs (re-tentative apres pop-up annulee ok), serre pour un
  // brute force.
  const ip = getClientIp(req);
  const rl = await checkRateLimit('webauthn-login', ip, {
    limit: 10,
    windowSeconds: 5 * 60,
  });
  if (rl.limited) {
    logger.warn('webauthn.login-verify', 'rate limit hit', { ip });
    return NextResponse.json(
      {
        error: `Trop de tentatives. Reessayez dans ${rl.retryAfter ?? 60}s.`,
      },
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
    // requireUserVerification: false pour back-compat avec les passkeys
    // existants enregistres sans UV (USB keys sans PIN, Touch ID en mode
    // presence-seule). La couche d encouragement est cote registration:
    // generateRegistrationOptions / generateAuthenticationOptions emettent
    // userVerification: 'preferred', donc l'authenticator FERA UV s il en
    // est capable. Setter `true` ici exclurait des authenticators
    // legitimes - trade-off documente en sprint 5 #7.
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
