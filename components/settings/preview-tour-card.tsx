'use client';

import { useRouter } from 'next/navigation';
import { FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Carte reservee aux admin/superadmin : permet de declencher le tour guide
 * d un role (cdp ou commercial) pour le tester sans modifier sa propre
 * colonne onboarding_completed_at. Pousse vers /accueil?tour-preview=ROLE,
 * OnboardingTour detecte le param et lance le tour en mode simulation.
 */
export function PreviewTourCard() {
  const { push } = useRouter();

  function preview(role: 'cdp' | 'commercial') {
    // On vise /projets (et non /accueil) car /accueil redirige server-side
    // vers /projets pour tout user assigne, ce qui drop le query param.
    push(`/projets?tour-preview=${role}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="size-5" />
          Tester le tour guidé
        </CardTitle>
        <CardDescription>
          Réservé aux superadmin : simule le parcours d’onboarding d’un rôle
          pour le vérifier. Ton propre état onboarding n’est pas modifié.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => preview('cdp')}>
          Lancer le tour CDP
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => preview('commercial')}
        >
          Lancer le tour commercial
        </Button>
      </CardContent>
    </Card>
  );
}
