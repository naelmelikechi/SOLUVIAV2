'use client';

import { useMemo, useState } from 'react';
import { Search, Plus, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  STATUT_IDEE_ORDER,
  CIBLE_IDEE_LABELS,
  type StatutIdee,
  type CibleIdee,
} from '@/lib/utils/constants';
import { cn } from '@/lib/utils';
import { IdeaColumn } from './idea-column';
import { IdeaSubmitDialog } from './idea-submit-dialog';
import { IdeaDetailSheet } from './idea-detail-sheet';
import type { IdeeWithRefs } from '@/lib/queries/idees';

interface IdeasBoardProps {
  initialGrouped: Record<StatutIdee, IdeeWithRefs[]>;
  currentUserId: string;
  canValidate: boolean;
  canShip: boolean;
}

export function IdeasBoard({
  initialGrouped,
  currentUserId,
  canValidate,
  canShip,
}: IdeasBoardProps) {
  const [submitOpen, setSubmitOpen] = useState(false);
  const [selected, setSelected] = useState<IdeeWithRefs | null>(null);
  const [search, setSearch] = useState('');
  const [cibleFilter, setCibleFilter] = useState<string>('all');
  const [authorFilter, setAuthorFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    const result = {} as Record<StatutIdee, IdeeWithRefs[]>;
    for (const s of STATUT_IDEE_ORDER) {
      result[s] = initialGrouped[s].filter((i) => {
        if (
          search &&
          !i.titre.toLowerCase().includes(search.toLowerCase()) &&
          !(i.description ?? '').toLowerCase().includes(search.toLowerCase())
        )
          return false;
        if (cibleFilter !== 'all' && i.cible !== cibleFilter) return false;
        if (authorFilter === 'me' && i.auteur_id !== currentUserId)
          return false;
        return true;
      });
    }
    return result;
  }, [initialGrouped, search, cibleFilter, authorFilter, currentUserId]);

  const totals = useMemo(() => {
    const proposees = filtered.proposee.length;
    const validees = filtered.validee.length;
    const implementees = filtered.implementee.length;
    return { proposees, validees, implementees };
  }, [filtered]);

  const hasActiveFilter =
    search !== '' || cibleFilter !== 'all' || authorFilter !== 'all';

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Proposées" value={totals.proposees} />
        <StatTile label="Validées" value={totals.validees} accent="blue" />
        <StatTile
          label="Implémentées"
          value={totals.implementees}
          accent="green"
        />
      </div>

      {/* Toolbar */}
      <div className="border-border/60 bg-card/50 flex flex-wrap items-center gap-2 rounded-lg border p-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            placeholder="Rechercher une idée..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-transparent bg-transparent pl-8 focus-visible:border-transparent"
          />
        </div>

        <div className="bg-border/60 mx-1 h-6 w-px" aria-hidden />

        <Filter className="text-muted-foreground ml-1 h-3.5 w-3.5" />

        <Select
          value={cibleFilter}
          onValueChange={(v) => setCibleFilter(v ?? 'all')}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Cible" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes cibles</SelectItem>
            {(Object.keys(CIBLE_IDEE_LABELS) as CibleIdee[]).map((c) => (
              <SelectItem key={c} value={c}>
                {CIBLE_IDEE_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={authorFilter}
          onValueChange={(v) => setAuthorFilter(v ?? 'all')}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Auteur" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous auteurs</SelectItem>
            <SelectItem value="me">Mes idées</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilter && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setCibleFilter('all');
              setAuthorFilter('all');
            }}
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
          >
            Réinitialiser
          </button>
        )}

        <div className="ml-auto">
          <Button size="sm" onClick={() => setSubmitOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Proposer une idée
          </Button>
        </div>
      </div>

      {/* Kanban */}
      <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {STATUT_IDEE_ORDER.map((s) => (
          <IdeaColumn
            key={s}
            statut={s}
            idees={filtered[s]}
            onCardClick={setSelected}
          />
        ))}
      </div>

      <IdeaSubmitDialog open={submitOpen} onOpenChange={setSubmitOpen} />

      <IdeaDetailSheet
        idee={selected}
        currentUserId={currentUserId}
        canValidate={canValidate}
        canShip={canShip}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'blue' | 'green';
}) {
  return (
    <div
      className={cn(
        'border-border/60 rounded-lg border p-4 transition-colors',
        accent === 'blue' && 'border-blue-500/20 bg-blue-500/5',
        accent === 'green' && 'border-green-500/20 bg-green-500/5',
        !accent && 'bg-card',
      )}
    >
      <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          accent === 'blue' && 'text-blue-600',
          accent === 'green' && 'text-green-600',
        )}
      >
        {value.toLocaleString('fr-FR')}
      </div>
    </div>
  );
}
