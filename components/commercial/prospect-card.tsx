'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MapPin, User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/shared/status-badge';
import type { ProspectWithCommercial } from '@/lib/queries/prospects';

interface ProspectCardProps {
  prospect: ProspectWithCommercial;
  onClick: () => void;
  disabled?: boolean;
}

function formatVolume(n: number | null): string {
  if (n === null) return '-';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

export function ProspectCard({
  prospect,
  onClick,
  disabled,
}: ProspectCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: prospect.id,
      disabled,
    });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
      }}
      className={cn(
        'group bg-card border-border hover:border-primary/40 relative rounded-md border p-3 transition-all duration-150',
        'hover:-translate-y-px hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
        isDragging && 'opacity-40 shadow-lg',
      )}
    >
      {/* Drag handle — only this triggers dnd, so the card body stays clickable */}
      <button
        type="button"
        aria-label="Déplacer"
        className={cn(
          'text-muted-foreground/40 group-hover:text-muted-foreground absolute top-2 right-2 cursor-grab rounded p-0.5 transition-colors active:cursor-grabbing',
          disabled && 'hidden',
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <button type="button" onClick={onClick} className="w-full text-left">
        <h4 className="line-clamp-2 pr-6 text-[13px] leading-tight font-semibold">
          {prospect.nom}
        </h4>

        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          {prospect.region && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {prospect.region}
            </span>
          )}
          {prospect.volume_apprenants !== null && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Users className="h-3 w-3" />
              {formatVolume(prospect.volume_apprenants)}
            </span>
          )}
        </div>

        {prospect.dirigeant_nom && (
          <div className="text-muted-foreground mt-1.5 truncate text-[11px]">
            {prospect.dirigeant_nom}
          </div>
        )}

        <div className="border-border/60 mt-2.5 flex items-center justify-between border-t pt-2">
          {prospect.commercial ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium">
              <User className="text-muted-foreground h-3 w-3" />
              {prospect.commercial.prenom}
            </span>
          ) : (
            <StatusBadge label="Non assigné" color="gray" />
          )}
        </div>
      </button>
    </div>
  );
}
