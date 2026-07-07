'use client';
import { cn } from '@/lib/crm/utils';
import { runWithToast } from '@/components/crm/shared/run-with-toast';
import { moveOpportuniteStage } from '@/lib/crm/actions/opportunites';
import type { Etape } from './types';

export function StageBar({
  etapes,
  currentId,
  oppId,
}: {
  etapes: Etape[];
  currentId: string;
  oppId: string;
}) {
  const open = etapes.filter((e) => e.type === 'ouverte');
  const currentIdx = open.findIndex((e) => e.id === currentId);
  return (
    <div className="flex gap-1">
      {open.map((e, i) => (
        <button
          key={e.id}
          type="button"
          title={e.libelle}
          aria-label={`Déplacer vers l'étape ${e.libelle}`}
          onClick={() =>
            // moveOpportuniteStage revalide /pipeline (route courante) : pas de router.refresh() redondant.
            runWithToast(() => moveOpportuniteStage(oppId, e.id, e.libelle), {
              error: 'Déplacement impossible',
            })
          }
          // Segments franchis teintés à la couleur de leur étape (cohérent kanban/tableau).
          className={cn(
            'h-2 flex-1 rounded-full transition-colors',
            i > currentIdx && 'bg-secondary hover:bg-secondary/70',
          )}
          style={i <= currentIdx ? { background: e.couleur } : undefined}
        />
      ))}
    </div>
  );
}
