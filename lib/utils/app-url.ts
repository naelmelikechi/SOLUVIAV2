import { env } from '@/lib/env';

/**
 * URL absolue de l app (sans trailing slash). Utilisee dans les emails et
 * autres contextes serveur-side qui doivent pointer vers le dashboard.
 *
 * Ordre :
 * 1. VERCEL_PROJECT_PRODUCTION_URL (set automatiquement sur prod + previews,
 *    vise toujours le domaine de production stable)
 * 2. Domaine prod statique en fallback si on est sur Vercel prod sans la
 *    variable (cas rare, hardening)
 * 3. localhost:3000 en dev
 */
export function getAppUrl(): string {
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  if (env.VERCEL_ENV === 'production') return 'https://app.mysoluvia.com';
  return 'http://localhost:3000';
}
