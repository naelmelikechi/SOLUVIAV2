'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  STAGE_PROSPECT_LABELS,
  STAGE_PROSPECT_ORDER,
  type StageProspect,
} from '@/lib/utils/constants';
import { updateProspectStage } from '@/lib/actions/prospects';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ProspectWithCommercial } from '@/lib/queries/prospects';

interface ProspectRowProps {
  prospect: ProspectWithCommercial;
  onClick: () => void;
  onStageChanged: (prospectId: string, newStage: StageProspect) => void;
  canEdit: boolean;
  selected: boolean;
  onSelectedChange: (id: string, checked: boolean) => void;
}

export const PIPELINE_GRID_COLS =
  'grid-cols-[28px_minmax(0,2.2fr)_minmax(0,1.4fr)_90px_minmax(0,1.4fr)_140px_70px_120px]';

const STAGE_DOT: Record<StageProspect, string> = {
  non_contacte: 'bg-neutral-400',
  r1: 'bg-blue-500',
  r2: 'bg-orange-500',
  signe: 'bg-green-600',
};

function formatVolume(n: number | null): string {
  if (n === null) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

function initials(prenom?: string | null, nom?: string | null): string {
  const p = (prenom ?? '').trim();
  const n = (nom ?? '').trim();
  return ((p[0] ?? '') + (n[0] ?? '')).toUpperCase() || '?';
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function freshnessTone(
  days: number | null,
  stage: StageProspect,
): {
  label: string;
  className: string;
} | null {
  if (days === null) return null;
  if (stage === 'signe') return null;
  const threshold = stage === 'non_contacte' ? 30 : stage === 'r1' ? 14 : 10;
  if (days < threshold) return null;
  const heavy = days >= threshold * 2;
  return {
    label: `${days}j`,
    className: heavy
      ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
      : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  };
}

export function ProspectRow({
  prospect,
  onClick,
  onStageChanged,
  canEdit,
  selected,
  onSelectedChange,
}: ProspectRowProps) {
  const [isPending, startTransition] = useTransition();

  function handleStageChange(value: string) {
    const next = value as StageProspect;
    if (!STAGE_PROSPECT_ORDER.includes(next) || next === prospect.stage) return;
    onStageChanged(prospect.id, next);
    startTransition(async () => {
      const result = await updateProspectStage(prospect.id, next);
      if (!result.success) {
        toast.error(result.error ?? 'Impossible de changer le stage');
        onStageChanged(prospect.id, prospect.stage);
      }
    });
  }

  const days = daysSince(prospect.updated_at);
  const fresh = freshnessTone(days, prospect.stage);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        'group hover:bg-accent/40 border-border/40 grid cursor-pointer items-center gap-2 border-b px-3 py-1.5 text-[12.5px] transition-colors',
        PIPELINE_GRID_COLS,
        isPending && 'opacity-60',
        selected && 'bg-primary/5',
      )}
    >
      <span
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="flex items-center justify-center"
      >
        <Checkbox
          checked={selected}
          onCheckedChange={(c) => onSelectedChange(prospect.id, !!c)}
          aria-label="Sélectionner"
        />
      </span>

      <div className="min-w-0">
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="block truncate font-medium">{prospect.nom}</span>
            }
          />
          <TooltipContent>{prospect.nom}</TooltipContent>
        </Tooltip>
      </div>

      <div className="text-muted-foreground min-w-0 truncate text-[12px]">
        {prospect.region ?? ''}
      </div>

      <div className="text-muted-foreground text-right text-[12px] tabular-nums">
        {formatVolume(prospect.volume_apprenants)}
      </div>

      <div className="text-muted-foreground min-w-0 truncate text-[12px]">
        {prospect.dirigeant_nom ?? ''}
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        {prospect.commercial ? (
          <>
            <span
              className="bg-muted text-muted-foreground inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold"
              aria-hidden
            >
              {initials(prospect.commercial.prenom, prospect.commercial.nom)}
            </span>
            <span className="text-muted-foreground truncate text-[12px]">
              {prospect.commercial.prenom}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground/50 truncate text-[12px] italic">
            Non assigné
          </span>
        )}
      </div>

      <div className="text-right">
        {fresh ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                    fresh.className,
                  )}
                >
                  {fresh.label}
                </span>
              }
            />
            <TooltipContent>
              Aucune mise à jour depuis {days} jour{days! > 1 ? 's' : ''}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground/40 text-[10px] tabular-nums">
            {days !== null ? `${days}j` : ''}
          </span>
        )}
      </div>

      <span
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Select
          value={prospect.stage}
          onValueChange={(v) => v && handleStageChange(v)}
          disabled={!canEdit || isPending}
        >
          <SelectTrigger className="hover:bg-muted/60 h-6 w-full border-transparent bg-transparent px-1.5 text-[11px] shadow-none focus-visible:border-transparent">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  STAGE_DOT[prospect.stage],
                )}
                aria-hidden
              />
              <SelectValue>
                {(v) =>
                  STAGE_PROSPECT_LABELS[v as StageProspect] ??
                  STAGE_PROSPECT_LABELS[prospect.stage]
                }
              </SelectValue>
            </span>
          </SelectTrigger>
          <SelectContent>
            {STAGE_PROSPECT_ORDER.map((s) => (
              <SelectItem key={s} value={s} label={STAGE_PROSPECT_LABELS[s]}>
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn('h-1.5 w-1.5 rounded-full', STAGE_DOT[s])}
                    aria-hidden
                  />
                  {STAGE_PROSPECT_LABELS[s]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </span>
    </div>
  );
}
