'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Compass } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Carte affichee dans Mon compte pour les CDP / commerciaux. Permet de
 * relancer le tour guide a tout moment : reset onboarding_completed_at
 * puis push vers /accueil et refresh pour que le shell remonte
 * OnboardingTour avec completedAt=null.
 */
export function RelaunchTourCard() {
  const { push, refresh } = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRelaunch() {
    setLoading(true);
    const res = await fetch('/api/onboarding/complete', { method: 'DELETE' });
    setLoading(false);

    if (!res.ok) {
      toast.error(
        'Impossible de relancer la visite. Réessaie dans un instant.',
      );
      return;
    }
    toast.success('Visite relancée, direction l’accueil...');
    push('/accueil');
    refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Compass className="size-5" />
          Visite guidée
        </CardTitle>
        <CardDescription>
          Revois le tour de découverte de Soluvia quand tu veux.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          variant="outline"
          onClick={handleRelaunch}
          disabled={loading}
        >
          {loading ? 'Lancement...' : 'Refaire la visite'}
        </Button>
      </CardContent>
    </Card>
  );
}
