'use client';
import { type CSSProperties } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/crm/ui/card';
import type { OppCard } from './types';

export function KanbanCard({ opp, tint }: { opp: OppCard; tint?: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: opp.id });
  const router = useRouter();
  const style = {
    ...(transform
      ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
      : {}),
    // Variable CSS + classes (plutôt qu'un backgroundColor inline) : préserve le hover: et le mode sombre.
    ...(tint ? ({ '--card-tint': tint } as CSSProperties) : {}),
  };
  const tintCls = tint
    ? ' bg-[color-mix(in_srgb,var(--card-tint)_18%,var(--color-card))] hover:bg-[color-mix(in_srgb,var(--card-tint)_28%,var(--color-card))] dark:bg-[color-mix(in_srgb,var(--card-tint)_16%,var(--color-card))] dark:hover:bg-[color-mix(in_srgb,var(--card-tint)_24%,var(--color-card))]'
    : '';
  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      aria-label={`Ouvrir l'opportunité ${opp.intitule}`}
      onClick={() => router.push(`/crm/pipeline?opp=${opp.id}`)}
      onKeyDown={(e) => {
        // Ouverture au clavier (la carte est focusable via les attributs dnd-kit).
        if (e.key === 'Enter') {
          e.preventDefault();
          router.push(`/crm/pipeline?opp=${opp.id}`);
        }
      }}
      className={`cursor-grab p-3 text-sm ${isDragging ? 'opacity-50' : ''}${tintCls}`}
    >
      <div className="font-medium">{opp.intitule}</div>
      <div className="text-muted-foreground text-xs">
        {opp.compte?.nom ?? '-'}
      </div>
      <div className="text-muted-foreground mt-1 flex items-center justify-between text-xs">
        <span className="shrink-0">
          {opp.probabilite != null && opp.probabilite > 0
            ? `${opp.probabilite}%`
            : ''}
        </span>
        <span className="ml-2 min-w-0 truncate">
          {[opp.owner?.prenom, opp.owner?.nom].filter(Boolean).join(' ')}
        </span>
      </div>
    </Card>
  );
}
