'use client';
// Frontière d'erreur des routes /crm : remplace l'écran d'erreur Next brut par un
// message FR avec action de réessai (U-C3).
import { useEffect } from 'react';
import { Button } from '@/components/crm/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Journalisé côté client ; le détail serveur reste masqué en production.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Une erreur est survenue
        </h2>
        <p className="text-muted-foreground text-sm">
          Impossible d&apos;afficher cette page. Réessaie, ou recharge
          l&apos;application.
        </p>
      </div>
      <Button onClick={reset} variant="outline" size="sm">
        Réessayer
      </Button>
    </div>
  );
}
