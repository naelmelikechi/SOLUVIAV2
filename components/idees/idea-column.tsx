'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { STATUT_IDEE_LABELS, type StatutIdee } from '@/lib/utils/constants';
import { IdeaCard } from './idea-card';
import type { IdeeWithRefs } from '@/lib/queries/idees';

interface IdeaColumnProps {
  statut: StatutIdee;
  idees: IdeeWithRefs[];
  onCardClick: (idee: IdeeWithRefs) => void;
  draggable?: boolean;
  onCardDragStart?: (idee: IdeeWithRefs) => void;
  onCardDragEnd?: () => void;
  onDropIdee?: (e: React.DragEvent<HTMLDivElement>, target: StatutIdee) => void;
  isValidDropTarget?: boolean;
}

const DOT_COLORS: Record<StatutIdee, string> = {
  proposee: 'bg-neutral-400',
  validee: 'bg-blue-500',
  implementee: 'bg-green-600',
  rejetee: 'bg-red-500',
};

const OUTLINE_COLORS: Record<StatutIdee, string> = {
  proposee: 'ring-neutral-400/50 bg-neutral-400/5',
  validee: 'ring-blue-500/50 bg-blue-500/5',
  implementee: 'ring-green-500/50 bg-green-500/5',
  rejetee: 'ring-red-500/50 bg-red-500/5',
};

export function IdeaColumn({
  statut,
  idees,
  onCardClick,
  draggable = false,
  onCardDragStart,
  onCardDragEnd,
  onDropIdee,
  isValidDropTarget = false,
}: IdeaColumnProps) {
  const [isOver, setIsOver] = useState(false);

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!isValidDropTarget) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDragEnter(e: React.DragEvent<HTMLDivElement>) {
    if (!isValidDropTarget) return;
    e.preventDefault();
    setIsOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    // Only clear when leaving the column itself, not crossing over child
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsOver(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    setIsOver(false);
    if (!isValidDropTarget) return;
    e.preventDefault();
    onDropIdee?.(e, statut);
  }

  const highlight = isOver && isValidDropTarget;

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'bg-muted/30 border-border/60 flex min-h-[calc(100vh-260px)] flex-col rounded-lg border transition-all duration-150',
        highlight && `ring-2 ring-offset-0 ${OUTLINE_COLORS[statut]}`,
      )}
    >
      <div className="border-border/60 flex items-center justify-between border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={cn('h-2 w-2 rounded-full', DOT_COLORS[statut])}
            aria-hidden
          />
          <h3 className="text-[13px] font-semibold tracking-tight">
            {STATUT_IDEE_LABELS[statut]}
          </h3>
        </div>
        <span className="bg-card text-muted-foreground inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-md px-1.5 text-[11px] font-medium tabular-nums">
          {idees.length}
        </span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {idees.length === 0 ? (
          <div className="text-muted-foreground/60 py-10 text-center text-xs">
            Aucune idée
          </div>
        ) : (
          idees.map((idee) => (
            <IdeaCard
              key={idee.id}
              idee={idee}
              onClick={() => onCardClick(idee)}
              draggable={draggable}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
            />
          ))
        )}
      </div>
    </div>
  );
}
