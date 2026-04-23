'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Building2, User, Users } from 'lucide-react';
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
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
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
        opacity: isDragging ? 0.4 : 1,
      }}
      className={cn(
        'bg-card border-border hover:border-primary/50 group cursor-grab rounded-lg border p-3 shadow-sm transition-colors active:cursor-grabbing',
      )}
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="w-full text-left"
      >
        <div className="mb-1.5 flex items-start gap-2">
          <Building2 className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
          <h4 className="line-clamp-2 flex-1 text-sm leading-tight font-semibold">
            {prospect.nom}
          </h4>
        </div>

        <div className="text-muted-foreground mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {prospect.region && <span>{prospect.region}</span>}
          {prospect.volume_apprenants !== null && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {formatVolume(prospect.volume_apprenants)}
            </span>
          )}
        </div>

        {prospect.dirigeant_nom && (
          <div className="text-muted-foreground text-xs">
            {prospect.dirigeant_nom}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between">
          {prospect.commercial ? (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              <User className="h-3 w-3" />
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
