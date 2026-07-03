import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { getAppUrl } from '@/lib/utils/app-url';

const siteUrl = (env.NEXT_PUBLIC_SITE_URL ?? getAppUrl()).replace(/\/$/, '');

/**
 * Sitemap minimal : seulement les pages publiques. Toutes les autres
 * routes sont auth-only et n'ont pas vocation a etre indexees.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: `${siteUrl}/login`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 1.0,
    },
    {
      url: `${siteUrl}/mentions-legales`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${siteUrl}/politique-de-confidentialite`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
