import { JWT } from 'google-auth-library';
import { env } from '@/lib/env';
import { logger } from '@/lib/utils/logger';

const SCOPE = 'gmail.client';

// Delai d'expiration sur les appels HTTP Gmail. C'est le defaut qui a coute
// cher au lot 0 avec le client Eduvia (aucun timeout -> requete bloquee
// indefiniment) : ne pas le reproduire ici.
const TIMEOUT_MS = 10_000;

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export function gmailConfigured(): boolean {
  return Boolean(env.GMAIL_SERVICE_ACCOUNT_JSON && env.GMAIL_DOMAINE);
}

/**
 * Refuse toute adresse hors du domaine Workspace autorise (GMAIL_DOMAINE).
 *
 * Un compte de service delegue a l'echelle du domaine (domain-wide delegation)
 * peut techniquement usurper N'IMPORTE QUELLE boite du domaine Google
 * Workspace. La console d'admin Google restreint deja les scopes autorises,
 * mais ce garde-fou doit AUSSI vivre explicitement dans le code : on ne se
 * repose pas uniquement sur une config externe pour une action aussi
 * sensible que lire la messagerie d'un salarie.
 */
export function assertAdresseDansDomaine(email: string): void {
  const domaine = env.GMAIL_DOMAINE;
  if (!domaine) {
    throw new Error('GMAIL_DOMAINE non configure');
  }
  const emailDomaine = email.split('@')[1]?.toLowerCase();
  if (emailDomaine !== domaine.toLowerCase()) {
    throw new Error(`Adresse hors du domaine autorise (${domaine}) : ${email}`);
  }
}

function buildJwt(subject: string): JWT {
  assertAdresseDansDomaine(subject);
  if (!env.GMAIL_SERVICE_ACCOUNT_JSON) {
    throw new Error('GMAIL_SERVICE_ACCOUNT_JSON non configure');
  }
  const creds = JSON.parse(env.GMAIL_SERVICE_ACCOUNT_JSON) as {
    client_email: string;
    private_key: string;
  };
  return new JWT({
    email: creds.client_email,
    key: creds.private_key,
    subject,
    scopes: [GMAIL_READONLY_SCOPE],
  });
}

export interface GmailMessageHeaders {
  id: string;
  sujet: string;
  de: string | null;
  a: string[];
  date: string | null;
}

/**
 * Liste les IDs de messages correspondant a une requete Gmail. Ne recupere
 * QUE les IDs (endpoint messages.list) : aucun contenu, meme pas les
 * en-tetes, ne transite a cette etape.
 */
export async function listMessageIds(
  subject: string,
  query: string,
  maxResults = 50,
): Promise<string[]> {
  const jwt = buildJwt(subject);
  const { token } = await jwt.getAccessToken();
  if (!token) {
    logger.warn(SCOPE, 'listMessageIds: pas de token', { subject });
    return [];
  }

  const url = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(subject)}/messages`,
  );
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', String(maxResults));

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    logger.warn(SCOPE, 'listMessageIds: reponse non-OK', {
      status: res.status,
      subject,
    });
    return [];
  }
  const body = (await res.json()) as { messages?: { id: string }[] };
  return (body.messages ?? []).map((m) => m.id);
}

/**
 * Recupere UNIQUEMENT les metadonnees d'un message : Subject, From, To,
 * Date. `format=metadata` + `metadataHeaders` garantit que le corps du
 * message ne transite JAMAIS, pas meme en memoire -- l'API Gmail ne le
 * renvoie pas dans la reponse quand ce format est demande. Recuperer le
 * message complet pour n'en garder qu'une partie serait une collecte
 * excessive, meme si rien n'etait stocke ensuite.
 */
export async function getMessageMetadata(
  subject: string,
  messageId: string,
): Promise<GmailMessageHeaders | null> {
  const jwt = buildJwt(subject);
  const { token } = await jwt.getAccessToken();
  if (!token) {
    logger.warn(SCOPE, 'getMessageMetadata: pas de token', {
      subject,
      messageId,
    });
    return null;
  }

  const url = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(subject)}/messages/${encodeURIComponent(messageId)}`,
  );
  url.searchParams.set('format', 'metadata');
  for (const header of ['Subject', 'From', 'To', 'Date']) {
    url.searchParams.append('metadataHeaders', header);
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    logger.warn(SCOPE, 'getMessageMetadata: reponse non-OK', {
      status: res.status,
      subject,
      messageId,
    });
    return null;
  }
  const body = (await res.json()) as {
    id: string;
    payload?: { headers?: { name: string; value: string }[] };
  };
  const headers = body.payload?.headers ?? [];
  const find = (name: string): string | null =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
    null;

  return {
    id: body.id,
    sujet: find('Subject') ?? '(sans objet)',
    de: find('From'),
    a: (find('To') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    date: find('Date'),
  };
}
