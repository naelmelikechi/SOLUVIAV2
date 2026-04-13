'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <AlertTriangle className="h-12 w-12 text-red-500" />
      <h2 className="text-lg font-semibold">Une erreur est survenue</h2>
      <p className="text-muted-foreground max-w-md text-center text-sm">
        {error.message ||
          'Impossible de charger cette page. Veuillez réessayer.'}
      </p>
      <Button onClick={reset}>Réessayer</Button>
    </div>
  );
}
