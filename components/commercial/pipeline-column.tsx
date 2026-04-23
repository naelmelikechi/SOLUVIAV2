'use client';

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import {
  STAGE_PROSPECT_LABELS,
  STAGE_PROSPECT_COLORS,
  type StageProspect,
} from '@/lib/utils/constants';
import { ProspectCard } from './prospect-card';
import type { ProspectWithCommercial } from '@/lib/queries/prospects';

interface PipelineColumnProps {
  stage: StageProspect;
  prospects: ProspectWithCommercial[];
  onCardClick: (prospect: ProspectWithCommercial) => void;
  canEdit: boolean;
}

const DOT_COLORS: Record<StageProspect, string> = {
  non_contacte: 'bg-neutral-400',
  r1: 'bg-blue-500',
  r2: 'bg-orange-500',
  signe: 'bg-green-600',
};

// Display-only — mapping is defined via STAGE_PROSPECT_COLORS for badges;
// here we use a more saturated dot for column headers.
void STAGE_PROSPECT_COLORS;

export function PipelineColumn({
  stage,
  prospects,
  onCardClick,
  canEdit,
}: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'bg-muted/30 flex min-h-[calc(100vh-260px)] flex-col rounded-lg border transition-all duration-150',
        isOver
          ? 'border-primary/60 bg-primary/5 ring-primary/20 ring-2'
          : 'border-border/60',
      )}
    >
      <div className="border-border/60 flex items-center justify-between border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={cn('h-2 w-2 rounded-full', DOT_COLORS[stage])}
            aria-hidden
          />
          <h3 className="text-[13px] font-semibold tracking-tight">
            {STAGE_PROSPECT_LABELS[stage]}
          </h3>
        </div>
        <span className="bg-card text-muted-foreground inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-md px-1.5 text-[11px] font-medium tabular-nums">
          {prospects.length}
        </span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {prospects.length === 0 ? (
          <div className="text-muted-foreground/60 flex flex-col items-center justify-center gap-1 py-10 text-center">
            <p className="text-xs">Aucun prospect</p>
            {isOver && (
              <p className="text-primary/70 text-[11px]">Déposer ici</p>
            )}
          </div>
        ) : (
          prospects.map((p) => (
            <ProspectCard
              key={p.id}
              prospect={p}
              onClick={() => onCardClick(p)}
              disabled={!canEdit}
            />
          ))
        )}
      </div>
    </div>
  );
}
