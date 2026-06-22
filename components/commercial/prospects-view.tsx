'use client';

import { useEffect, useState } from 'react';
import { LayoutGrid, Table as TableIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProspectsDataTable } from './prospects-data-table';
import { PipelineBoard } from './pipeline-board';
import type {
  ProspectListItem,
  ProspectWithCommercial,
  StageMedian,
} from '@/lib/queries/prospects';
import type { StageProspect } from '@/lib/utils/constants';

interface Commercial {
  id: string;
  nom: string;
  prenom: string;
}

interface ProspectsViewProps {
  prospects: ProspectListItem[];
  grouped: Record<StageProspect, ProspectWithCommercial[]>;
  commerciaux: Commercial[];
  regions: string[];
  currentUserId: string;
  isAdmin: boolean;
  stageMedians: StageMedian[];
}

const TOGGLE =
  'flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors';
const TOGGLE_ON = 'border-primary/40 bg-primary/10 text-primary';
const TOGGLE_OFF =
  'border-border/60 text-muted-foreground hover:bg-muted/60 bg-transparent';

// Vue unique des prospects : un seul jeu de données, deux modes d'affichage
// (Tableau riche triable = défaut, ou Kanban par étape). Remplace l'ancien
// couple /commercial/prospects + /commercial/pipeline.
export function ProspectsView({
  prospects,
  grouped,
  commerciaux,
  regions,
  currentUserId,
  isAdmin,
  stageMedians,
}: ProspectsViewProps) {
  const [view, setView] = useState<'table' | 'kanban'>(() => {
    if (typeof window === 'undefined') return 'table';
    return localStorage.getItem('commercial_view') === 'kanban'
      ? 'kanban'
      : 'table';
  });

  useEffect(() => {
    localStorage.setItem('commercial_view', view);
  }, [view]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => setView('table')}
          className={cn(TOGGLE, view === 'table' ? TOGGLE_ON : TOGGLE_OFF)}
          aria-pressed={view === 'table'}
        >
          <TableIcon className="size-3.5" />
          Tableau
        </button>
        <button
          type="button"
          onClick={() => setView('kanban')}
          className={cn(TOGGLE, view === 'kanban' ? TOGGLE_ON : TOGGLE_OFF)}
          aria-pressed={view === 'kanban'}
        >
          <LayoutGrid className="size-3.5" />
          Kanban
        </button>
      </div>

      {view === 'table' ? (
        <ProspectsDataTable
          data={prospects}
          commerciaux={commerciaux}
          currentUserId={currentUserId}
        />
      ) : (
        <PipelineBoard
          initialGrouped={grouped}
          commerciaux={commerciaux}
          regions={regions}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          stageMedians={stageMedians}
        />
      )}
    </div>
  );
}
