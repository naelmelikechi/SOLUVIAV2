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
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRelaunch() {
    setLoading(true);
    const res = await fetch('/api/onboarding/complete', { method: 'DELETE' });
    setLoading(false);

    if (!res.ok) {
      toast.error(
        'Impossible de relancer la visite. Reessaie dans un instant.',
      );
      return;
    }
    toast.success('Visite relancee, direction l accueil...');
    router.push('/accueil');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Compass className="h-5 w-5" />
          Visite guidee
        </CardTitle>
        <CardDescription>
          Revois le tour de decouverte de Soluvia quand tu veux.
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
