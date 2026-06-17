'use client';

import { useMemo, useState, useTransition, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Search,
  Users as UsersIcon,
  ChevronDown,
  TrendingUp,
  X,
  LayoutGrid,
  Table as TableIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatPercent } from '@/lib/utils/formatters';
import {
  STAGE_PROSPECT_ORDER,
  STAGE_PROSPECT_LABELS,
  TYPE_PROSPECT_LABELS,
  type StageProspect,
  type TypeProspect,
} from '@/lib/utils/constants';
import {
  loadProspectDetails,
  bulkUpdateProspects,
} from '@/lib/actions/prospects';
import { ProspectRow, PIPELINE_GRID_COLS } from './prospect-row';
import { ProspectDetailSheet } from './prospect-detail-sheet';
import { ProspectImportButton } from './prospect-import-button';
import { PipelineTable } from './pipeline-table';
import type {
  ProspectWithCommercial,
  ProspectNote,
  StageMedian,
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
  stageMedians: StageMedian[];
}

const STAGE_DOT: Record<StageProspect, string> = {
  a_qualifier: 'bg-neutral-400',
  presente: 'bg-blue-500',
  cadre: 'bg-orange-500',
  audite: 'bg-purple-500',
  signe: 'bg-green-600',
  perdu: 'bg-red-500',
};

// Tunnel commercial linéaire : 'perdu' est une étape de sortie, hors progression.
const TUNNEL: StageProspect[] = STAGE_PROSPECT_ORDER.filter(
  (s) => s !== 'perdu',
);

// Seuil d'alerte « sans contact récent » (jours) selon la position dans le tunnel.
// Étapes terminales (signature + 'perdu') : pas d'alerte.
function staleThresholdDays(stage: StageProspect): number | null {
  const idx = TUNNEL.indexOf(stage);
  if (idx === -1 || idx === TUNNEL.length - 1) return null;
  if (idx === 0) return 30;
  if (idx === 1) return 14;
  return 10;
}

type SortKey = 'volume' | 'nom' | 'updated';

function startOfMonth(d = new Date()): number {
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

// oxlint-disable-next-line react-doctor/no-giant-component
export function PipelineBoard({
  initialGrouped,
  commerciaux,
  regions,
  currentUserId,
  isAdmin,
  stageMedians,
  // oxlint-disable-next-line react-doctor/prefer-useReducer
}: PipelineBoardProps) {
  const medianByStage = useMemo(() => {
    const map = {} as Record<StageProspect, StageMedian | undefined>;
    for (const m of stageMedians) map[m.fromStage] = m;
    return map;
  }, [stageMedians]);

  const [grouped, setGrouped] = useState(initialGrouped);

  const [search, setSearch] = useState('');
  const [commercialFilter, setCommercialFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [minVolume, setMinVolume] = useState<string>('');
  const [staleOnly, setStaleOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('volume');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [collapsed, setCollapsed] = useState<Record<StageProspect, boolean>>(
    () => {
      const init = {} as Record<StageProspect, boolean>;
      for (const s of STAGE_PROSPECT_ORDER) init[s] = false;
      return init;
    },
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPending, startBulkTransition] = useTransition();
  const [nowMs] = useState(() => Date.now());

  const [selected, setSelected] = useState<ProspectWithCommercial | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<ProspectNote[]>([]);
  const [selectedRdvs, setSelectedRdvs] = useState<RdvCommercialWithRefs[]>([]);
  const [selectedClient, setSelectedClient] = useState<{
    id: string;
    raison_sociale: string;
  } | null>(null);

  const [layoutView, setLayoutView] = useState<'kanban' | 'table'>(() => {
    if (typeof window === 'undefined') return 'kanban';
    const saved = localStorage.getItem('commercial_view');
    return saved === 'table' ? 'table' : 'kanban';
  });

  useEffect(() => {
    localStorage.setItem('commercial_view', layoutView);
  }, [layoutView]);

  const filtered = useMemo(() => {
    const result = {} as Record<StageProspect, ProspectWithCommercial[]>;
    const term = search.trim().toLowerCase();
    const minV = minVolume ? parseInt(minVolume, 10) : null;

    for (const stage of STAGE_PROSPECT_ORDER) {
      const items = grouped[stage].filter((p) => {
        if (term) {
          const hay = [
            p.nom,
            p.region,
            p.siret,
            p.dirigeant_nom,
            p.dirigeant_email,
            p.dirigeant_telephone,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          // oxlint-disable-next-line react-doctor/js-set-map-lookups
          if (!hay.includes(term)) return false;
        }
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
        if (typeFilter !== 'all' && p.type_prospect !== typeFilter)
          return false;
        if (minV !== null && !isNaN(minV) && (p.volume_apprenants ?? 0) < minV)
          return false;
        if (staleOnly) {
          const threshold = staleThresholdDays(stage);
          if (threshold === null) return false;
          const days = p.updated_at
            ? Math.floor(
                (nowMs - new Date(p.updated_at).getTime()) /
                  (1000 * 60 * 60 * 24),
              )
            : null;
          if (days === null || days < threshold) return false;
        }
        return true;
      });

      const sorted = items.toSorted((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1;
        if (sortKey === 'volume') {
          return (
            ((a.volume_apprenants ?? 0) - (b.volume_apprenants ?? 0)) * dir
          );
        }
        if (sortKey === 'nom') {
          return a.nom.localeCompare(b.nom, 'fr') * dir;
        }
        const at = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const bt = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return (at - bt) * dir;
      });

      result[stage] = sorted;
    }
    return result;
  }, [
    grouped,
    search,
    commercialFilter,
    regionFilter,
    typeFilter,
    minVolume,
    staleOnly,
    sortKey,
    sortDir,
    currentUserId,
    nowMs,
  ]);

  function handleStageChanged(prospectId: string, newStage: StageProspect) {
    setGrouped((prev) => {
      let prospect: ProspectWithCommercial | null = null;
      let sourceStage: StageProspect | null = null;
      for (const stage of STAGE_PROSPECT_ORDER) {
        // oxlint-disable-next-line react-doctor/js-index-maps
        const found = prev[stage].find((p) => p.id === prospectId);
        if (found) {
          prospect = found;
          sourceStage = stage;
          break;
        }
      }
      if (!prospect || !sourceStage || sourceStage === newStage) return prev;
      const next = { ...prev };
      next[sourceStage] = prev[sourceStage].filter((p) => p.id !== prospectId);
      next[newStage] = [
        { ...prospect, stage: newStage, updated_at: new Date().toISOString() },
        ...prev[newStage],
      ];
      return next;
    });
  }

  async function handleRowClick(prospect: ProspectWithCommercial) {
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

  function handleSelectionChange(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function selectAllVisible() {
    const all = new Set<string>();
    for (const stage of STAGE_PROSPECT_ORDER) {
      for (const p of filtered[stage]) all.add(p.id);
    }
    setSelectedIds(all);
  }

  function applyBulk(patch: {
    commercialId?: string | null;
    stage?: StageProspect;
  }) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    startBulkTransition(async () => {
      const result = await bulkUpdateProspects(ids, patch);
      if (!result.success) {
        toast.error(result.error ?? 'Échec de la mise à jour');
        return;
      }
      toast.success(`${result.updated} prospect(s) mis à jour`);
      setGrouped((prev) => {
        const next = {} as Record<StageProspect, ProspectWithCommercial[]>;
        for (const stage of STAGE_PROSPECT_ORDER) {
          next[stage] = [...prev[stage]];
        }
        const idSet = new Set(ids);
        const now = new Date().toISOString();

        if (patch.stage) {
          const moving: ProspectWithCommercial[] = [];
          for (const stage of STAGE_PROSPECT_ORDER) {
            const keep: ProspectWithCommercial[] = [];
            for (const p of next[stage]) {
              if (idSet.has(p.id) && stage !== patch.stage) {
                moving.push({ ...p, stage: patch.stage, updated_at: now });
              } else {
                keep.push(p);
              }
            }
            next[stage] = keep;
          }
          next[patch.stage] = [...moving, ...next[patch.stage]];
        }

        if (patch.commercialId !== undefined) {
          const commercial =
            patch.commercialId === null
              ? null
              : (commerciaux.find((c) => c.id === patch.commercialId) ?? null);
          for (const stage of STAGE_PROSPECT_ORDER) {
            next[stage] = next[stage].map((p) =>
              idSet.has(p.id)
                ? {
                    ...p,
                    commercial_id: patch.commercialId ?? null,
                    commercial,
                    updated_at: now,
                  }
                : p,
            );
          }
        }

        return next;
      });
      clearSelection();
    });
  }

  const totals = useMemo(() => {
    const counts = {} as Record<StageProspect, number>;
    for (const s of STAGE_PROSPECT_ORDER) counts[s] = filtered[s].length;
    const total = STAGE_PROSPECT_ORDER.reduce((acc, s) => acc + counts[s], 0);
    const volume = STAGE_PROSPECT_ORDER.reduce(
      (acc, s) =>
        acc +
        filtered[s].reduce((sub, p) => sub + (p.volume_apprenants ?? 0), 0),
      0,
    );
    // Pipeline actif : étapes du tunnel au-delà de la première (hors 'perdu').
    const inFunnel = TUNNEL.slice(1).reduce((acc, s) => acc + counts[s], 0);
    const conversion = total > 0 ? (counts.signe / total) * 100 : 0;
    const monthStart = startOfMonth(new Date(nowMs));
    const signedThisMonth = filtered.signe.filter((p) =>
      p.updated_at ? new Date(p.updated_at).getTime() >= monthStart : false,
    ).length;

    return {
      total,
      counts,
      volume,
      inFunnel,
      conversion,
      signedThisMonth,
    };
  }, [filtered, nowMs]);

  const allVisibleIds = useMemo(() => {
    const ids: string[] = [];
    for (const stage of STAGE_PROSPECT_ORDER) {
      for (const p of filtered[stage]) ids.push(p.id);
    }
    return ids;
  }, [filtered]);

  const flatFiltered = useMemo(
    () => STAGE_PROSPECT_ORDER.flatMap((s) => filtered[s]),
    [filtered],
  );

  const allSelected =
    allVisibleIds.length > 0 &&
    allVisibleIds.every((id) => selectedIds.has(id));
  const someSelected =
    !allSelected && allVisibleIds.some((id) => selectedIds.has(id));

  const hasActiveFilter =
    search !== '' ||
    commercialFilter !== 'all' ||
    regionFilter !== 'all' ||
    typeFilter !== 'all' ||
    minVolume !== '' ||
    staleOnly;

  function resetFilters() {
    setSearch('');
    setCommercialFilter('all');
    setRegionFilter('all');
    setTypeFilter('all');
    setMinVolume('');
    setStaleOnly(false);
  }

  function toggleStage(stage: StageProspect) {
    setCollapsed((prev) => ({ ...prev, [stage]: !prev[stage] }));
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'nom' ? 'asc' : 'desc');
    }
  }

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '';

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid grid-cols-4 gap-3">
        <StatTile
          label="Prospects"
          value={totals.total.toLocaleString('fr-FR')}
          sub={`${totals.inFunnel} en pipeline actif`}
          icon={UsersIcon}
        />
        <StatTile
          label="Volume potentiel"
          value={totals.volume.toLocaleString('fr-FR')}
          sub="apprenants / salariés"
        />
        <StatTile
          label="Taux de signature"
          value={formatPercent(totals.conversion, 1)}
          sub={`${totals.counts.signe} signés / ${totals.total}`}
          icon={TrendingUp}
        />
        <StatTile
          label="Signés ce mois"
          value={totals.signedThisMonth.toLocaleString('fr-FR')}
          sub="basé sur dernière maj"
          accent
        />
      </div>

      <div className="border-border/60 bg-card/50 flex flex-wrap items-center gap-2 rounded-lg border p-2">
        <div className="relative min-w-[260px] flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            placeholder="Rechercher (nom, SIRET, dirigeant, région)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-transparent bg-transparent pl-8 focus-visible:border-transparent"
          />
        </div>

        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v ?? 'all')}
        >
          <SelectTrigger size="sm" className="h-8 w-[130px]">
            <SelectValue>
              {(v) =>
                v === 'all'
                  ? 'Tous types'
                  : TYPE_PROSPECT_LABELS[v as TypeProspect]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" label="Tous types">
              Tous types
            </SelectItem>
            <SelectItem value="cfa" label="CFA">
              CFA
            </SelectItem>
            <SelectItem value="entreprise" label="Entreprise">
              Entreprise
            </SelectItem>
          </SelectContent>
        </Select>

        <button
          type="button"
          onClick={() => setStaleOnly((s) => !s)}
          className={cn(
            'h-8 rounded-md border px-2.5 text-xs font-medium transition-colors',
            staleOnly
              ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300'
              : 'border-border/60 text-muted-foreground hover:bg-muted/60 bg-transparent',
          )}
        >
          Sans contact récent
        </button>

        {hasActiveFilter && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
          >
            Réinitialiser
          </button>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setLayoutView('kanban')}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors',
              layoutView === 'kanban'
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border/60 text-muted-foreground hover:bg-muted/60 bg-transparent',
            )}
            aria-pressed={layoutView === 'kanban'}
          >
            <LayoutGrid className="size-3.5" />
            Kanban
          </button>
          <button
            type="button"
            onClick={() => setLayoutView('table')}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors',
              layoutView === 'table'
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border/60 text-muted-foreground hover:bg-muted/60 bg-transparent',
            )}
            aria-pressed={layoutView === 'table'}
          >
            <TableIcon className="size-3.5" />
            Tableau
          </button>
          {isAdmin && <ProspectImportButton />}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          commerciaux={commerciaux}
          disabled={bulkPending}
          onAssign={(commercialId) => applyBulk({ commercialId })}
          onChangeStage={(stage) => applyBulk({ stage })}
          onClear={clearSelection}
        />
      )}

      {layoutView === 'table' ? (
        <div className="flex-1 overflow-auto">
          <PipelineTable prospects={flatFiltered} onRowClick={handleRowClick} />
        </div>
      ) : null}

      <div
        className={cn(
          'border-border/60 bg-card flex-1 overflow-auto rounded-lg border',
          layoutView === 'table' && 'hidden',
        )}
      >
        <div
          className={cn(
            'border-border/60 text-muted-foreground bg-card/95 sticky top-0 z-10 grid items-center gap-2 border-b px-3 py-1 text-[11px] backdrop-blur',
            PIPELINE_GRID_COLS,
          )}
        >
          <span
            role="presentation"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="flex items-center justify-center"
          >
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onCheckedChange={(c) =>
                c ? selectAllVisible() : clearSelection()
              }
              aria-label="Sélectionner tout"
            />
          </span>

          <button
            type="button"
            onClick={() => toggleSort('nom')}
            className="hover:text-foreground flex items-center gap-1 text-left text-[10px] font-medium tracking-wide uppercase"
          >
            Nom{' '}
            <span className="text-foreground/60">{sortIndicator('nom')}</span>
          </button>

          <Select
            value={regionFilter}
            onValueChange={(v) => setRegionFilter(v ?? 'all')}
          >
            <SelectTrigger
              size="sm"
              className="hover:bg-muted/60 h-7 w-full justify-between border-transparent bg-transparent px-2 text-[11px] shadow-none focus-visible:border-transparent"
            >
              <SelectValue>
                {(v) => (v === 'all' ? 'Toutes régions' : v)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" label="Toutes régions">
                Toutes régions
              </SelectItem>
              {regions.map((r) => (
                <SelectItem key={r} value={r} label={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            type="button"
            onClick={() => toggleSort('volume')}
            className="hover:text-foreground flex items-center justify-end gap-1 text-right text-[10px] font-medium tracking-wide uppercase"
          >
            Vol.{' '}
            <span className="text-foreground/60">
              {sortIndicator('volume')}
            </span>
          </button>

          <span className="text-[10px] font-medium tracking-wide uppercase">
            Dirigeant
          </span>

          <Select
            value={commercialFilter}
            onValueChange={(v) => setCommercialFilter(v ?? 'all')}
          >
            <SelectTrigger
              size="sm"
              className="hover:bg-muted/60 h-7 w-full justify-between border-transparent bg-transparent px-2 text-[11px] shadow-none focus-visible:border-transparent"
            >
              <SelectValue>
                {(v) => {
                  if (v === 'all') return 'Tous commerciaux';
                  if (v === 'me') return 'Moi';
                  if (v === 'unassigned') return 'Non assigné';
                  const c = commerciaux.find((x) => x.id === v);
                  return c ? `${c.prenom} ${c.nom}` : 'Commercial';
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" label="Tous commerciaux">
                Tous commerciaux
              </SelectItem>
              <SelectItem value="me" label="Moi">
                Moi
              </SelectItem>
              <SelectItem value="unassigned" label="Non assigné">
                Non assigné
              </SelectItem>
              {commerciaux.map((c) => (
                <SelectItem
                  key={c.id}
                  value={c.id}
                  label={`${c.prenom} ${c.nom}`}
                >
                  {c.prenom} {c.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            type="button"
            onClick={() => toggleSort('updated')}
            className="hover:text-foreground flex items-center justify-end gap-1 text-right text-[10px] font-medium tracking-wide uppercase"
          >
            Maj{' '}
            <span className="text-foreground/60">
              {sortIndicator('updated')}
            </span>
          </button>

          <span className="text-[10px] font-medium tracking-wide uppercase">
            Stage
          </span>
        </div>

        {STAGE_PROSPECT_ORDER.map((stage) => {
          const items = filtered[stage];
          const isCollapsed = collapsed[stage];
          const tunnelIdx = TUNNEL.indexOf(stage);
          const sumFromTunnel = (i: number) =>
            TUNNEL.slice(i).reduce((acc, s) => acc + totals.counts[s], 0);
          const stageRate =
            tunnelIdx >= 1 && sumFromTunnel(tunnelIdx - 1) > 0
              ? formatPercent(
                  (sumFromTunnel(tunnelIdx) / sumFromTunnel(tunnelIdx - 1)) *
                    100,
                )
              : null;

          return (
            <div key={stage}>
              <button
                type="button"
                onClick={() => toggleStage(stage)}
                className="bg-muted/30 hover:bg-muted/50 border-border/40 sticky top-[36px] z-[5] flex w-full items-center gap-1.5 border-b px-3 py-1 text-left text-[11px] font-medium transition-colors"
              >
                <ChevronDown
                  className={cn(
                    'text-muted-foreground size-3 transition-transform',
                    isCollapsed && '-rotate-90',
                  )}
                />
                <span
                  className={cn('size-1.5 rounded-full', STAGE_DOT[stage])}
                  aria-hidden
                />
                <span>{STAGE_PROSPECT_LABELS[stage]}</span>
                <span className="text-muted-foreground/70 tabular-nums">
                  {items.length}
                </span>
                {stageRate && (
                  <span className="text-muted-foreground/50 ml-2 text-[10px]">
                    conversion entrants → {stageRate}
                  </span>
                )}
                {medianByStage[stage]?.medianDays != null && (
                  <span className="text-muted-foreground/50 ml-2 text-[10px]">
                    durée médiane {medianByStage[stage]!.medianDays}j
                    {medianByStage[stage]!.sampleSize > 0
                      ? ` (n=${medianByStage[stage]!.sampleSize})`
                      : ''}
                  </span>
                )}
              </button>

              {!isCollapsed &&
                (items.length === 0 ? (
                  <div className="text-muted-foreground/50 border-border/40 border-b px-3 py-2 text-[11px] italic">
                    Aucun prospect
                  </div>
                ) : (
                  items.map((p) => (
                    <ProspectRow
                      key={p.id}
                      prospect={p}
                      onClick={() => handleRowClick(p)}
                      onStageChanged={handleStageChanged}
                      canEdit
                      selected={selectedIds.has(p.id)}
                      onSelectedChange={handleSelectionChange}
                    />
                  ))
                ))}
            </div>
          );
        })}
      </div>

      <ProspectDetailSheet
        prospect={selected}
        notes={selectedNotes}
        rdvs={selectedRdvs}
        commerciaux={commerciaux}
        convertedClient={selectedClient}
        onOpenChange={(open) => !open && setSelected(null)}
        isAdminUser={isAdmin}
        onProspectDeleted={(deletedId) => {
          setGrouped((prev) => {
            const next = { ...prev };
            for (const stage of STAGE_PROSPECT_ORDER) {
              next[stage] = prev[stage].filter((p) => p.id !== deletedId);
            }
            return next;
          });
        }}
      />
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
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
        {Icon && <Icon className="size-3" />}
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
      {sub && (
        <div className="text-muted-foreground/70 mt-0.5 text-[11px]">{sub}</div>
      )}
    </div>
  );
}

function BulkActionBar({
  count,
  commerciaux,
  disabled,
  onAssign,
  onChangeStage,
  onClear,
}: {
  count: number;
  commerciaux: Commercial[];
  disabled: boolean;
  onAssign: (commercialId: string | null) => void;
  onChangeStage: (stage: StageProspect) => void;
  onClear: () => void;
}) {
  return (
    <div className="border-primary/20 bg-primary/5 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
      <span className="font-medium">
        {count} prospect{count > 1 ? 's' : ''} sélectionné{count > 1 ? 's' : ''}
      </span>
      <span className="text-muted-foreground/60">|</span>

      <Select
        onValueChange={(v) => {
          const value = v as string | null;
          if (!value) return;
          onAssign(value === 'none' ? null : value);
        }}
        disabled={disabled}
      >
        <SelectTrigger size="sm" className="h-7 w-[200px]">
          <SelectValue placeholder="Assigner à...">
            {() => 'Assigner à...'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" label="Désassigner">
            Désassigner
          </SelectItem>
          {commerciaux.map((c) => (
            <SelectItem key={c.id} value={c.id} label={`${c.prenom} ${c.nom}`}>
              {c.prenom} {c.nom}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        onValueChange={(v) => {
          const value = v as string | null;
          if (value) onChangeStage(value as StageProspect);
        }}
        disabled={disabled}
      >
        <SelectTrigger size="sm" className="h-7 w-[170px]">
          <SelectValue placeholder="Changer le stage...">
            {() => 'Changer le stage...'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STAGE_PROSPECT_ORDER.map((s) => (
            <SelectItem key={s} value={s} label={STAGE_PROSPECT_LABELS[s]}>
              {STAGE_PROSPECT_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="ml-auto h-7"
      >
        <X className="mr-1 size-3.5" />
        Désélectionner
      </Button>
    </div>
  );
}
