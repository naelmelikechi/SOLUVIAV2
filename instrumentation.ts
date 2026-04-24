import * as Sentry from '@sentry/nextjs';

// Hook Next.js instrumentation: exec a chaque boot runtime (edge/node).
// Sentry est initialise a la demande - si aucun DSN n'est present,
// `init` est un no-op effectif.
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      // Serveur: on capture tout niveau error, pas de replay.
    });
    return;
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: 0.05,
    });
  }
}

// Propage les erreurs remontees depuis les requetes Next 15+ vers Sentry.
export const onRequestError = Sentry.captureRequestError;
