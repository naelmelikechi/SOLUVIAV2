/**
 * Correlation ID pour tracer une requete a travers les logs serveur.
 *
 * Vercel injecte `x-vercel-id` sur chaque requete (format
 * `iad1::xxx-1234-yyy`). On l'utilise comme identifiant de correlation
 * quand il est present, avec un fallback nanoid-like pour les contextes
 * hors Vercel.
 *
 * Usage :
 *   import { getRequestId } from '@/lib/utils/request-id';
 *   const requestId = await getRequestId();
 *   logger.error('scope', err, { requestId });
 *
 * Cote client (window defini) : retourne toujours null.
 * Hors contexte requete (lib code appele depuis un test ou un script) :
 * retourne null si next/headers n'est pas disponible.
 */

// Cache de la fonction headers() pour eviter N dynamic imports dans une
// meme requete. L'import reste lazy pour ne pas inclure next/headers dans
// un bundle client.
let cachedHeadersFn: (() => Promise<Headers> | Headers) | null = null;

async function getHeadersSafely(): Promise<Headers | null> {
  if (typeof window !== 'undefined') return null;
  try {
    if (!cachedHeadersFn) {
      const mod = await import('next/headers');
      cachedHeadersFn = mod.headers as () => Promise<Headers>;
    }
    const result = cachedHeadersFn();
    // next/headers peut etre sync ou async selon la version de Next
    return result instanceof Promise ? await result : result;
  } catch {
    // On est hors contexte requete (Server Action non executee, script
    // CLI, tests). Pas d'erreur, juste pas de request ID.
    return null;
  }
}

/**
 * Renvoie l'ID de correlation de la requete courante, ou null si
 * non disponible (client, hors requete).
 */
export async function getRequestId(): Promise<string | null> {
  const headers = await getHeadersSafely();
  if (!headers) return null;
  return headers.get('x-vercel-id') ?? headers.get('x-request-id') ?? null;
}

/**
 * Version synchrone qui tente headers() de maniere synchrone (certaines
 * versions de Next la rendent dispo synchroniquement via getter). Toujours
 * retourne null sans throw si le contexte n'est pas disponible.
 *
 * A utiliser dans le logger qui doit rester synchrone. Pour le code
 * applicatif, prefere getRequestId().
 */
export function getRequestIdSync(): string | null {
  if (typeof window !== 'undefined') return null;
  if (!cachedHeadersFn) return null;
  try {
    const result = cachedHeadersFn();
    if (result instanceof Promise) return null;
    return result.get('x-vercel-id') ?? result.get('x-request-id') ?? null;
  } catch {
    return null;
  }
}
