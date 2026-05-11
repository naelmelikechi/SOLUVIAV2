import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// Content-Security-Policy : applique uniquement en prod. En dev, Next.js
// utilise eval() pour HMR + des origines variables, ce qui rend une CSP
// stricte ingerable sans nonces. Voir docs/SECURITY.md.
//
// 'unsafe-inline' sur script-src est requis par Next.js (scripts d'init
// inlines pour l'hydration). On accepte le compromis : protection contre
// les XSS reflechis via injection HTML, sans la couverture totale qu'aurait
// une CSP base sur des nonces (a venir si le risque le justifie).
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://api.dicebear.com https://*.giphy.com https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://*.ingest.us.sentry.io https://va.vercel-scripts.com https://vitals.vercel-insights.com",
  "frame-src 'self' https://*.eduvia.app",
  // 'self' (et non 'none') : la sheet d apercu de brouillon de facture
  // utilise un <iframe> meme-origine pour rendre le PDF, ce que 'none'
  // bloquait (Chrome: "app.mysoluvia.com n autorise pas la connexion").
  // X-Frame-Options: SAMEORIGIN reste actif comme defense en profondeur.
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const isProd = process.env.NODE_ENV === 'production';

const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  ...(isProd ? [{ key: 'Content-Security-Policy', value: cspDirectives }] : []),
];

const nextConfig: NextConfig = {
  // Reduce function invocations - cache dynamic pages for 60s
  experimental: {
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
    // Tree-shake les barrel files lourds (lucide-react: 1k+ icones,
    // date-fns: 200+ helpers). Next.js applique des transforms specifiques
    // qui reduisent significativement le bundle client.
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
      },
    ],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

// Sentry: tunnelRoute proxie les envelopes via /monitoring (meme-origine),
// ce qui contourne les bloqueurs de pub qui filtrent *.ingest.sentry.io
// et evite les erreurs ERR_BLOCKED_BY_CLIENT en console.
export default withSentryConfig(nextConfig, {
  tunnelRoute: '/monitoring',
  silent: !process.env.CI,
});
