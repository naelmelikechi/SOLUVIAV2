'use client';
import { useDroppable } from '@dnd-kit/core';
import { KanbanCard } from './kanban-card';
import type { Etape, OppCard } from './types';

export function KanbanColumn({
  etape,
  opps,
}: {
  etape: Etape;
  opps: OppCard[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etape.id });
  return (
    <div
      ref={setNodeRef}
      className={`border-border bg-card/50 flex w-72 shrink-0 flex-col rounded-xl border p-3 ${isOver ? 'ring-primary ring-2' : ''}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: etape.couleur }}
          />
          {etape.libelle}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {opps.length}
        </span>
      </div>
      <div className="space-y-2">
        {opps.map((o) => (
          <KanbanCard key={o.id} opp={o} tint={etape.couleur} />
        ))}
      </div>
    </div>
  );
}
