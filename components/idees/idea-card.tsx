'use client';

import { useDraggable } from '@dnd-kit/core';
import { User, CheckCircle, Rocket, XCircle, GripVertical } from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import { CIBLE_IDEE_LABELS, CIBLE_IDEE_COLORS } from '@/lib/utils/constants';
import { formatDateLong } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import type { IdeeWithRefs } from '@/lib/queries/idees';

interface IdeaCardProps {
  idee: IdeeWithRefs;
  onClick: () => void;
  draggable?: boolean;
}

const STATUT_ICONS = {
  proposee: null,
  validee: CheckCircle,
  implementee: Rocket,
  rejetee: XCircle,
} as const;

const STATUT_ICON_COLORS = {
  proposee: '',
  validee: 'text-blue-600',
  implementee: 'text-green-600',
  rejetee: 'text-red-500',
} as const;

export function IdeaCard({ idee, onClick, draggable = false }: IdeaCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: idee.id,
    data: { statut: idee.statut },
    disabled: !draggable,
  });

  const StatutIcon = STATUT_ICONS[idee.statut];
  const iconColor = STATUT_ICON_COLORS[idee.statut];

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'group bg-card border-border hover:border-primary/40 relative w-full cursor-pointer rounded-md border p-3 text-left transition-all duration-150 select-none hover:-translate-y-px hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
        isDragging && 'opacity-40',
      )}
    >
      {draggable && (
        <button
          type="button"
          aria-label="Déplacer l'idée"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground/50 hover:bg-muted hover:text-foreground absolute top-1.5 right-1 inline-flex h-5 w-5 cursor-grab touch-none items-center justify-center rounded transition-colors active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="flex items-start gap-2">
        {StatutIcon && (
          <StatutIcon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${iconColor}`} />
        )}
        <h4 className="line-clamp-2 flex-1 pr-6 text-[13px] leading-tight font-semibold">
          {idee.titre}
        </h4>
      </div>

      {idee.description && (
        <p className="text-muted-foreground mt-1.5 line-clamp-2 text-[11px]">
          {idee.description}
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <StatusBadge
          label={CIBLE_IDEE_LABELS[idee.cible]}
          color={CIBLE_IDEE_COLORS[idee.cible]}
        />
        {idee.auteur && (
          <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
            <User className="h-3 w-3" />
            {idee.auteur.prenom}
          </span>
        )}
      </div>

      <div className="text-muted-foreground mt-1.5 text-[10px]">
        {formatDateLong(idee.created_at)}
      </div>
    </div>
  );
}
