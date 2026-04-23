'use client';

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/shared/status-badge';
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
        'bg-muted/30 border-border flex min-h-[calc(100vh-260px)] flex-col rounded-lg border transition-colors',
        isOver && 'border-primary/50 bg-primary/5',
      )}
    >
      <div className="border-border flex items-center justify-between border-b px-3 py-2">
        <StatusBadge
          label={STAGE_PROSPECT_LABELS[stage]}
          color={STAGE_PROSPECT_COLORS[stage]}
        />
        <span className="text-muted-foreground text-xs font-medium tabular-nums">
          {prospects.length}
        </span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {prospects.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-xs">
            Aucun prospect
          </p>
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
