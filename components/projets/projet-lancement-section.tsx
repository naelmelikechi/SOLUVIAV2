'use client';

import { Rocket } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  LANCEMENT_ETAPES,
  type LancementStatut,
} from '@/lib/lancement/constants';
import type { ProjetLancement } from '@/lib/queries/projet-lancement';
import { LancementEtapeItem } from './lancement-etape-item';

interface ProjetLancementSectionProps {
  projetId: string;
  projetRef: string;
  lancement: ProjetLancement;
  canEdit: boolean;
  userIsAdmin: boolean;
  currentUserId: string | null;
}

export function ProjetLancementSection({
  projetId,
  projetRef,
  lancement,
  canEdit,
  userIsAdmin,
  currentUserId,
}: ProjetLancementSectionProps) {
  const statutByKey = new Map(
    lancement.etapes.map((e) => [e.etape_key, e.statut as LancementStatut]),
  );
  const nbLancees = LANCEMENT_ETAPES.filter(
    (e) => statutByKey.get(e.key) === 'lance',
  ).length;

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Rocket className="size-4" /> Timeline de lancement
        </h3>
        <span className="text-muted-foreground text-xs">
          {nbLancees}/{LANCEMENT_ETAPES.length} lancées
        </span>
      </div>
      <ol className="space-y-3">
        {LANCEMENT_ETAPES.map((etape, index) => (
          <LancementEtapeItem
            key={etape.key}
            projetId={projetId}
            projetRef={projetRef}
            etapeKey={etape.key}
            etapeLabel={etape.label}
            index={index}
            isLast={index === LANCEMENT_ETAPES.length - 1}
            statut={statutByKey.get(etape.key) ?? 'non_commence'}
            documents={lancement.documents.filter(
              (d) => d.etape_key === etape.key,
            )}
            commentaires={lancement.commentaires.filter(
              (c) => c.etape_key === etape.key,
            )}
            canEdit={canEdit}
            userIsAdmin={userIsAdmin}
            currentUserId={currentUserId}
          />
        ))}
      </ol>
    </Card>
  );
}
