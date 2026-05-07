'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { logger } from '@/lib/utils/logger';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Forwarde a Sentry via le logger (vs console.error qui ne remontait
    // pas a la plateforme malgre l'instrumentation Sentry deja en place).
    logger.error('ui.dashboard', error, { digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <AlertTriangle className="text-destructive h-12 w-12" />
      <h2 className="text-lg font-semibold">Une erreur est survenue</h2>
      <p className="text-muted-foreground max-w-md text-center text-sm">
        {error.message ||
          'Impossible de charger cette page. Veuillez réessayer.'}
      </p>
      <Button onClick={reset}>Réessayer</Button>
    </div>
  );
}
