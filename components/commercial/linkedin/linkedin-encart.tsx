'use client';

import { useEffect, useState } from 'react';
import { Share2, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/utils/formatters';
import { CANAL_ORIGINE_LABELS } from '@/lib/utils/constants';
import { getLastLinkedinEvent } from '@/lib/actions/linkedin';
import type { LinkedinEventRecord } from '@/lib/queries/linkedin';
import type { BadgeColor } from '@/components/shared/status-badge';
import type { Database } from '@/types/database';

type TypeEvenementLinkedin =
  Database['public']['Enums']['type_evenement_linkedin'];
type StatutEvenementLinkedin =
  Database['public']['Enums']['statut_evenement_linkedin'];

// Libellés/couleurs des enums LinkedIn. Source unique côté client (les
// constantes partagées du projet sont figées ; ces maps vivent ici et sont
// réimportées par la liste d'évènements admin).
export const TYPE_EVENEMENT_LINKEDIN_LABELS: Record<
  TypeEvenementLinkedin,
  string
> = {
  reponse_positive: 'Réponse positive',
  connexion_acceptee: 'Connexion acceptée',
  mention_interet: "Marque d'intérêt",
  rdv_demande: 'RDV demandé',
};

export const STATUT_EVENEMENT_LINKEDIN_LABELS: Record<
  StatutEvenementLinkedin,
  string
> = {
  nouveau: 'Nouveau',
  traite: 'Traité',
  ignore: 'Ignoré',
  erreur: 'Erreur',
};

export const STATUT_EVENEMENT_LINKEDIN_COLORS: Record<
  StatutEvenementLinkedin,
  BadgeColor
> = {
  nouveau: 'blue',
  traite: 'green',
  ignore: 'gray',
  erreur: 'red',
};

interface Props {
  prospectId: string;
}

/**
 * Encart « Origine LinkedIn » de la fiche prospect : affiche le dernier
 * évènement capté pour les prospects issus du connecteur (canal
 * `linkedin_auto`). Charge la donnée à la volée via une server action (la fiche
 * étant rendue côté client, on évite de retoucher la page serveur).
 */
export function LinkedinEncart({ prospectId }: Props) {
  const [event, setEvent] = useState<LinkedinEventRecord | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void getLastLinkedinEvent(prospectId)
      .then((e) => {
        if (!active) return;
        setEvent(e);
        setLoaded(true);
      })
      .catch(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [prospectId]);

  if (!loaded) {
    return (
      <Card className="space-y-3 p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </Card>
    );
  }

  if (!event) return null;

  return (
    <Card className="p-6">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Share2 className="size-4 text-blue-600" />
        {CANAL_ORIGINE_LABELS.linkedin_auto}
      </h2>
      <dl className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Évènement</dt>
          <dd className="font-medium">
            {TYPE_EVENEMENT_LINKEDIN_LABELS[event.type_evenement]}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Capté le</dt>
          <dd className="font-medium tabular-nums">
            {formatDate(event.date_evenement ?? event.created_at)}
          </dd>
        </div>
        {event.linkedin_profil_url && (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Profil</dt>
            <dd>
              <a
                href={event.linkedin_profil_url}
                target="_blank"
                rel="noreferrer"
                className="text-primary inline-flex items-center gap-1 hover:underline"
              >
                Voir le profil
                <ExternalLink className="size-3" />
              </a>
            </dd>
          </div>
        )}
      </dl>
      {event.contenu_message && (
        <div className="mt-4">
          <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wider uppercase">
            Message capté
          </p>
          <p className="text-muted-foreground text-sm whitespace-pre-line">
            {event.contenu_message}
          </p>
        </div>
      )}
    </Card>
  );
}
