import * as Sentry from '@sentry/nextjs';

// Hook Next.js instrumentation: exec a chaque boot runtime (edge/node).
// Sentry est initialise a la demande - si aucun DSN n'est present,
// `init` est un no-op effectif.
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV;
  // Skip non-production envs: evite de polluer Sentry avec les events HMR/dev
  // local (cf. SOLUVIA-P: 196 events `localhost:3000`).
  const isProd = environment === 'production';

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn,
      environment,
      tracesSampleRate: 0.1,
      enabled: isProd,
    });
    return;
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn,
      environment,
      tracesSampleRate: 0.05,
      enabled: isProd,
    });
  }
}

// Propage les erreurs remontees depuis les requetes Next 15+ vers Sentry.
export const onRequestError = Sentry.captureRequestError;
