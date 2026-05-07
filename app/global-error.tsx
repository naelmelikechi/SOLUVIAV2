'use client';

import { useEffect } from 'react';

/**
 * Global error boundary - capte les erreurs qui crashent le root layout.
 * Doit definir son propre <html> et <body> car le layout normal a echoue.
 *
 * Reference Next.js : https://nextjs.org/docs/app/api-reference/file-conventions/error
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry direct car le logger pourrait dependre du layout.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      void import('@sentry/nextjs').then((Sentry) => {
        Sentry.captureException(error, {
          tags: { scope: 'ui.global', digest: error.digest ?? 'unknown' },
        });
      });
    }
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          padding: '2rem',
          textAlign: 'center',
          color: '#111',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
          Une erreur critique est survenue
        </h1>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>
          L&apos;équipe a été notifiée. Vous pouvez essayer de recharger la
          page.
        </p>
        <button
          onClick={reset}
          style={{
            padding: '0.5rem 1rem',
            background: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
          }}
        >
          Recharger
        </button>
      </body>
    </html>
  );
}
