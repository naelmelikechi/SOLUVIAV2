'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Search, Filter, Users as UsersIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  STAGE_PROSPECT_ORDER,
  type StageProspect,
} from '@/lib/utils/constants';
import {
  updateProspectStage,
  loadProspectDetails,
} from '@/lib/actions/prospects';
import { PipelineColumn } from './pipeline-column';
import { ProspectDetailSheet } from './prospect-detail-sheet';
import { ProspectImportButton } from './prospect-import-button';
import type {
  ProspectWithCommercial,
  ProspectNote,
} from '@/lib/queries/prospects';
import type { RdvCommercialWithRefs } from '@/lib/queries/rdv';

interface Commercial {
  id: string;
  nom: string;
  prenom: string;
}

interface PipelineBoardProps {
  initialGrouped: Record<StageProspect, ProspectWithCommercial[]>;
  commerciaux: Commercial[];
  regions: string[];
  currentUserId: string;
  isAdmin: boolean;
}

export function PipelineBoard({
  initialGrouped,
  commerciaux,
  regions,
  currentUserId,
  isAdmin,
}: PipelineBoardProps) {
  const [grouped, setGrouped] = useState(initialGrouped);
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Filters
  const [search, setSearch] = useState('');
  const [commercialFilter, setCommercialFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [minVolume, setMinVolume] = useState<string>('');

  // Detail sheet
  const [selected, setSelected] = useState<ProspectWithCommercial | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<ProspectNote[]>([]);
  const [selectedRdvs, setSelectedRdvs] = useState<RdvCommercialWithRefs[]>([]);
  const [selectedClient, setSelectedClient] = useState<{
    id: string;
    raison_sociale: string;
  } | null>(null);

  const filtered = useMemo(() => {
    const result = {} as Record<StageProspect, ProspectWithCommercial[]>;
    for (const stage of STAGE_PROSPECT_ORDER) {
      result[stage] = grouped[stage].filter((p) => {
        if (search && !p.nom.toLowerCase().includes(search.toLowerCase()))
          return false;
        if (commercialFilter === 'me' && p.commercial_id !== currentUserId)
          return false;
        if (commercialFilter === 'unassigned' && p.commercial_id !== null)
          return false;
        if (
          commercialFilter !== 'all' &&
          commercialFilter !== 'me' &&
          commercialFilter !== 'unassigned' &&
          p.commercial_id !== commercialFilter
        )
          return false;
        if (regionFilter !== 'all' && p.region !== regionFilter) return false;
        if (minVolume) {
          const min = parseInt(minVolume, 10);
          if (!isNaN(min) && (p.volume_apprenants ?? 0) < min) return false;
        }
        return true;
      });
    }
    return result;
  }, [
    grouped,
    search,
    commercialFilter,
    regionFilter,
    minVolume,
    currentUserId,
  ]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const newStage = over.id as StageProspect;
    if (!STAGE_PROSPECT_ORDER.includes(newStage)) return;

    const prospectId = active.id as string;
    let sourceStage: StageProspect | null = null;
    let prospect: ProspectWithCommercial | null = null;
    for (const stage of STAGE_PROSPECT_ORDER) {
      const found = grouped[stage].find((p) => p.id === prospectId);
      if (found) {
        sourceStage = stage;
        prospect = found;
        break;
      }
    }
    if (!prospect || !sourceStage || sourceStage === newStage) return;

    // Optimistic UI
    setGrouped((prev) => {
      const next = { ...prev };
      next[sourceStage!] = prev[sourceStage!].filter(
        (p) => p.id !== prospectId,
      );
      next[newStage] = [{ ...prospect!, stage: newStage }, ...prev[newStage]];
      return next;
    });

    startTransition(async () => {
      const result = await updateProspectStage(prospectId, newStage);
      if (!result.success) {
        toast.error(result.error ?? 'Impossible de déplacer le prospect');
        // Rollback
        setGrouped((prev) => {
          const next = { ...prev };
          next[newStage] = prev[newStage].filter((p) => p.id !== prospectId);
          next[sourceStage!] = [prospect!, ...prev[sourceStage!]];
          return next;
        });
      }
    });
  }

  async function handleCardClick(prospect: ProspectWithCommercial) {
    setSelected(prospect);
    setSelectedNotes([]);
    setSelectedRdvs([]);
    setSelectedClient(null);
    const details = await loadProspectDetails(prospect.id);
    if (details.prospect) {
      setSelected(details.prospect as ProspectWithCommercial);
      setSelectedNotes(details.notes as ProspectNote[]);
      setSelectedRdvs(details.rdvs as RdvCommercialWithRefs[]);
      setSelectedClient(details.convertedClient);
    }
  }

  const totals = useMemo(() => {
    const counts = STAGE_PROSPECT_ORDER.reduce(
      (acc, stage) => acc + filtered[stage].length,
      0,
    );
    const volume = STAGE_PROSPECT_ORDER.reduce(
      (acc, stage) =>
        acc +
        filtered[stage].reduce((sub, p) => sub + (p.volume_apprenants ?? 0), 0),
      0,
    );
    const signed = filtered.signe.length;
    return { counts, volume, signed };
  }, [filtered]);

  const hasActiveFilter =
    search !== '' ||
    commercialFilter !== 'all' ||
    regionFilter !== 'all' ||
    minVolume !== '';

  function resetFilters() {
    setSearch('');
    setCommercialFilter('all');
    setRegionFilter('all');
    setMinVolume('');
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile
          label="Prospects affichés"
          value={totals.counts.toLocaleString('fr-FR')}
          icon={UsersIcon}
        />
        <StatTile
          label="Volume apprentis potentiel"
          value={totals.volume.toLocaleString('fr-FR')}
        />
        <StatTile
          label="Signés"
          value={totals.signed.toLocaleString('fr-FR')}
          accent
        />
      </div>

      {/* Toolbar */}
      <div className="border-border/60 bg-card/50 flex flex-wrap items-center gap-2 rounded-lg border p-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            placeholder="Rechercher un prospect..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-transparent bg-transparent pl-8 focus-visible:border-transparent"
          />
        </div>

        <div className="bg-border/60 mx-1 h-6 w-px" aria-hidden />

        <Filter className="text-muted-foreground ml-1 h-3.5 w-3.5" />

        <Select
          value={commercialFilter}
          onValueChange={(v) => setCommercialFilter(v ?? 'all')}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Commercial" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous commerciaux</SelectItem>
            <SelectItem value="me">Moi</SelectItem>
            <SelectItem value="unassigned">Non assigné</SelectItem>
            {commerciaux.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.prenom} {c.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={regionFilter}
          onValueChange={(v) => setRegionFilter(v ?? 'all')}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Région" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes régions</SelectItem>
            {regions.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="number"
          placeholder="Volume min"
          value={minVolume}
          onChange={(e) => setMinVolume(e.target.value)}
          className="w-[120px]"
        />

        {hasActiveFilter && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
          >
            Réinitialiser
          </button>
        )}

        <div className="ml-auto">{isAdmin && <ProspectImportButton />}</div>
      </div>

      {/* Kanban */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STAGE_PROSPECT_ORDER.map((stage) => (
            <PipelineColumn
              key={stage}
              stage={stage}
              prospects={filtered[stage]}
              onCardClick={handleCardClick}
              canEdit={true}
            />
          ))}
        </div>
      </DndContext>

      <ProspectDetailSheet
        prospect={selected}
        notes={selectedNotes}
        rdvs={selectedRdvs}
        commerciaux={commerciaux}
        convertedClient={selectedClient}
        onOpenChange={(open) => !open && setSelected(null)}
        isAdminUser={isAdmin}
      />
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        'border-border/60 rounded-lg border p-4 transition-colors',
        accent ? 'bg-primary/5 border-primary/20' : 'bg-card',
      )}
    >
      <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          accent && 'text-primary',
        )}
      >
        {value}
      </div>
    </div>
  );
}
