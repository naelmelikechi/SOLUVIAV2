import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Réveille / attend la base avant un traitement lourd (CRON sync).
 *
 * L'instance Supabase self-hosted (Supavia) se met en veille à l'idle. Le
 * premier hit d'un CRON nocturne tombe alors sur un `connect` qui expire
 * (UND_ERR_CONNECT_TIMEOUT, 10 s) — d'où la cascade SOLUVIA-1H/1J/W/1K, une
 * erreur Sentry par requête de la sync. Au lieu de laisser chaque étape
 * échouer puis logger, on ping d'abord la base : les tentatives successives
 * laissent l'instance se réveiller. Si elle répond (même par une erreur
 * applicative : la socket est vivante), on continue ; sinon on lève UNE seule
 * `DbUnreachableError` que l'appelant logge une fois.
 *
 * Le vrai correctif reste infra (désactiver l'auto-pause de l'instance prod).
 */

// Signatures d'une panne de connexion (vs erreur applicative PostgREST, qui
// prouve au contraire que la socket répond).
const CONNECTION_ERROR =
  /fetch failed|ConnectTimeout|UND_ERR_CONNECT|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up/i;

const DEFAULT_DELAYS_MS = [2000, 5000, 10000] as const;

export class DbUnreachableError extends Error {
  readonly attempts: number;
  constructor(attempts: number, options?: { cause?: unknown }) {
    super(
      `Supabase injoignable après ${attempts} tentative(s) de connexion`,
      options,
    );
    this.name = 'DbUnreachableError';
    this.attempts = attempts;
  }
}

/**
 * Ping la base, en réessayant uniquement sur erreur de connexion. Retourne dès
 * que PostgREST répond (connexion vivante) ; lève `DbUnreachableError` si toutes
 * les tentatives sont des pannes de connexion.
 */
export async function waitForDb(
  supabase: SupabaseClient,
  opts: { table?: string; delaysMs?: readonly number[] } = {},
): Promise<void> {
  const { table = 'odoo_sync_logs', delaysMs = DEFAULT_DELAYS_MS } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    const { error } = await supabase
      .from(table)
      .select('*', { head: true, count: 'estimated' });
    const blob = error ? `${error.message ?? ''} ${error.details ?? ''}` : '';
    if (!error || !CONNECTION_ERROR.test(blob)) return; // socket vivante
    lastError = error;
    if (attempt < delaysMs.length) {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, delaysMs[attempt]);
      await promise;
    }
  }
  throw new DbUnreachableError(delaysMs.length + 1, { cause: lastError });
}
