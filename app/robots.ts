import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { getAppUrl } from '@/lib/utils/app-url';

const siteUrl = (env.NEXT_PUBLIC_SITE_URL ?? getAppUrl()).replace(/\/$/, '');

/**
 * SaaS authentifie : on autorise uniquement l'indexation des 3 pages
 * publiques (login, mentions legales, politique de confidentialite).
 * Tout le reste (dashboard, /admin, /projets, /factures, etc.) est
 * disallow pour ne pas leak de structure d'URL meme si une page etait
 * accidentellement servie sans auth.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/login', '/mentions-legales', '/politique-de-confidentialite'],
        disallow: ['/'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
