/**
 * Rejoue une requête Supabase rejetée pour `PGRST303` ("JWT issued at future").
 *
 * Cause : sur le Supabase self-hosted (Supavia), GoTrue émet le JWT avec un
 * `iat` qui, vu l'horloge de PostgREST au moment de la validation, est
 * légèrement dans le futur (skew d'horloge transitoire entre les services).
 * PostgREST rejette alors le token AVANT d'exécuter la requête — donc la rejouer
 * après un court délai (le temps que l'horloge de PostgREST rattrape le `iat`)
 * est strictement sans effet de bord, même pour une écriture : rien n'a tourné.
 *
 * C'est un pansement applicatif ciblé pour les lectures qui échouaient en
 * intermittence (Sentry SOLUVIA-M/-12/-Z/-11/-18, pages /projets et /temps).
 * Le vrai fix reste la synchro NTP sur l'hôte Supavia (hors de portée du code).
 */

const JWT_ISSUED_AT_FUTURE = 'PGRST303';
const DEFAULT_DELAYS_MS = [400, 1000] as const;

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

/**
 * Exécute `run()` ; tant que le résultat porte l'erreur PGRST303, attend puis
 * rejoue (un essai par délai fourni). Retourne le premier résultat non-skew,
 * ou le dernier résultat skew si tous les essais ont échoué (l'appelant gère
 * l'erreur comme avant).
 */
export async function withClockSkewRetry<
  R extends { error: { code?: string } | null },
>(
  run: () => PromiseLike<R>,
  delaysMs: readonly number[] = DEFAULT_DELAYS_MS,
): Promise<R> {
  let result = await run();
  for (const ms of delaysMs) {
    if (result.error?.code !== JWT_ISSUED_AT_FUTURE) break;
    await delay(ms);
    result = await run();
  }
  return result;
}
