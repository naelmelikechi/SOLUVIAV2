'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
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
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: idee.id,
      data: { statut: idee.statut },
      disabled: !draggable,
    });

  const StatutIcon = STATUT_ICONS[idee.statut];
  const iconColor = STATUT_ICON_COLORS[idee.statut];

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'group bg-card border-border hover:border-primary/40 relative w-full rounded-md border p-3 text-left transition-all duration-150 hover:-translate-y-px hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
        draggable && 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
    >
      {draggable && (
        <GripVertical className="text-muted-foreground/40 group-hover:text-muted-foreground absolute top-2 right-1.5 h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
      )}
      <div className="flex items-start gap-2">
        {StatutIcon && (
          <StatutIcon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${iconColor}`} />
        )}
        <h4 className="line-clamp-2 flex-1 pr-4 text-[13px] leading-tight font-semibold">
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
