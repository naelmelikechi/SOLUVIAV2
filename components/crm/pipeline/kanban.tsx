'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { moveOpportuniteStage } from '@/lib/crm/actions/opportunites';
import { KanbanColumn } from './kanban-column';
import type { Etape, OppCard } from './types';

export function Kanban({
  etapes,
  opportunites,
}: {
  etapes: Etape[];
  opportunites: OppCard[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(opportunites);
  const [syncedFrom, setSyncedFrom] = useState(opportunites);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  // Resync de l'état local quand les données serveur changent (pendant le render → pas de cascade).
  if (syncedFrom !== opportunites) {
    setSyncedFrom(opportunites);
    setItems(opportunites);
  }

  useEffect(() => {
    // Realtime opt-in : évite une connexion WebSocket en erreur quand Realtime n'est pas activé sur l'instance.
    // Import dynamique : supabase-js (~380 KB) reste hors du bundle initial du pipeline tant que Realtime est off.
    if (process.env.NEXT_PUBLIC_REALTIME !== 'true') return;
    let cleanup: (() => void) | undefined;
    import('@/lib/crm/supabase/client').then(({ createCrmBrowserClient }) => {
      const supabase = createCrmBrowserClient();
      const ch = supabase
        .channel('opps-rt')
        .on(
          'postgres_changes',
          { event: '*', schema: 'crm', table: 'opportunites' },
          () => router.refresh(),
        )
        .subscribe();
      cleanup = () => {
        supabase.removeChannel(ch);
      };
    });
    return () => cleanup?.();
  }, [router]);

  async function onDragEnd(e: DragEndEvent) {
    const oppId = String(e.active.id);
    const etapeId = e.over ? String(e.over.id) : null;
    if (!etapeId) return;
    const etape = etapes.find((x) => x.id === etapeId);
    const opp = items.find((o) => o.id === oppId);
    if (!etape || !opp || opp.etape_id === etapeId) return;
    setItems((prev) =>
      prev.map((o) => (o.id === oppId ? { ...o, etape_id: etapeId } : o)),
    );
    try {
      await moveOpportuniteStage(oppId, etapeId, etape.libelle);
    } catch {
      toast.error('Déplacement impossible');
      setItems(opportunites);
    }
  }

  // Regroupement par étape mémoïsé : le filter par colonne était recalculé
  // O(étapes × opps) à chaque render, y compris pendant le drag.
  const byEtape = useMemo(() => {
    const m = new Map<string, OppCard[]>();
    for (const o of items) {
      const arr = m.get(o.etape_id);
      if (arr) arr.push(o);
      else m.set(o.etape_id, [o]);
    }
    return m;
  }, [items]);

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {etapes.map((e) => (
          <KanbanColumn key={e.id} etape={e} opps={byEtape.get(e.id) ?? []} />
        ))}
      </div>
    </DndContext>
  );
}
