import { headers } from 'next/headers';

// Resolution dynamique du Relying Party (RP) WebAuthn.
//
// Le rpID DOIT correspondre au hostname effectif (sans port, sans scheme),
// sinon les passkeys enregistrees ne fonctionnent pas. On le derive de l'en-tete
// Host de la requete pour gerer transparentement localhost et prod.
//
// L'origin DOIT correspondre exactement (scheme + hostname + port). Sur prod
// HTTPS le port est implicite. En local on accepte http://localhost:<port>.
export interface WebAuthnRP {
  rpID: string;
  rpName: string;
  origin: string;
}

const RP_NAME = 'SOLUVIA';

export async function resolveRP(): Promise<WebAuthnRP> {
  const h = await headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto =
    h.get('x-forwarded-proto') ??
    (host.startsWith('localhost') ? 'http' : 'https');

  const rpID = host.split(':')[0]!;
  const origin = `${proto}://${host}`;

  return { rpID, rpName: RP_NAME, origin };
}
