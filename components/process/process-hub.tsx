'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowRight, Search, X } from 'lucide-react';
import { searchProcessAction } from '@/app/(dashboard)/process/actions';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Highlight } from '@/components/process/process-highlight';
import { cn } from '@/lib/utils';
import type { MissionSummary, ProcessListItem } from '@/lib/process/browse';
import type { ProcessSearchResult } from '@/lib/process/types';

const EXAMPLES = [
  "mandat d'apprentissage non conforme",
  "planning d'alternance",
  'escalade CFA',
  'cadrage entreprise',
];

interface ProcessHubProps {
  missions: MissionSummary[];
  all: ProcessListItem[];
}

export function ProcessHub({ missions, all }: ProcessHubProps) {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [results, setResults] = useState<ProcessSearchResult[]>([]);
  const [selectedMission, setSelectedMission] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const listRef = useRef<HTMLDivElement>(null);

  const bySourceId = useMemo(
    () => new Map(all.map((item) => [item.source_fiche_id, item])),
    [all],
  );

  function runSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setSubmittedQuery(trimmed);
    startTransition(async () => {
      const res = await searchProcessAction(trimmed);
      setResults(res);
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    runSearch(query);
  }

  function onChipClick(example: string) {
    setQuery(example);
    runSearch(example);
  }

  function clearSearch() {
    setSubmittedQuery(null);
    setResults([]);
    setQuery('');
  }

  function onMissionClick(code: string) {
    setSelectedMission((cur) => (cur === code ? null : code));
  }

  useEffect(() => {
    if (selectedMission) {
      listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedMission]);

  const filteredAll = selectedMission
    ? all.filter((p) => p.mission_code === selectedMission)
    : all;

  const selectedMissionNom =
    selectedMission &&
    (missions.find((m) => m.code === selectedMission)?.nom ?? null);

  return (
    <div className="mx-auto flex max-w-5xl flex-col pb-16">
      {/* ---- Hero ---- */}
      <div className="pt-6 pb-2 md:pt-10">
        <p className="text-muted-foreground font-mono text-[11px] tracking-[0.12em] uppercase">
          Base de connaissance des process
        </p>
        <h1 className="mt-2 max-w-[18ch] text-[28px] leading-[1.08] font-semibold tracking-tight md:text-4xl">
          Une question sur un process&nbsp;? Trouve la bonne procédure.
        </h1>
        <p className="text-muted-foreground mt-3 max-w-[52ch] text-[15px] md:text-base">
          Cherche en langage naturel ou parcours par mission. Seuls les process{' '}
          <span className="text-foreground font-medium">finalisés</span>{' '}
          apparaissent — prêts à suivre.
        </p>

        <form
          onSubmit={onSubmit}
          className="border-input bg-card focus-within:border-primary focus-within:ring-primary/15 mt-6 flex max-w-[640px] items-center gap-2 rounded-full border-[1.5px] py-1.5 pr-1.5 pl-4 shadow-sm transition focus-within:ring-4"
        >
          <Search className="text-muted-foreground size-[18px] shrink-0" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ex. que faire si le mandat d'apprentissage n'est pas conforme ?"
            aria-label="Rechercher un process"
            className="h-9 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
          <Button
            type="submit"
            disabled={pending}
            className="shrink-0 gap-1.5 rounded-full px-4"
          >
            {pending ? 'Recherche…' : 'Chercher'}
            <ArrowRight className="size-[15px]" />
          </Button>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground mr-0.5 text-[12.5px]">
            Essayez&nbsp;:
          </span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => onChipClick(example)}
              className="border-border bg-card text-muted-foreground hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-primary rounded-full border px-3.5 py-[7px] text-[13px] transition focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {submittedQuery ? (
        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <span className="font-semibold">« {submittedQuery} »</span>
            <span className="text-muted-foreground text-[13px]">
              {pending
                ? 'Recherche en cours…'
                : `${results.length} process pertinent${results.length > 1 ? 's' : ''}`}
            </span>
            <button
              type="button"
              onClick={clearSearch}
              className="text-primary focus-visible:outline-primary ml-auto inline-flex items-center gap-1.5 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <X className="size-3.5" />
              Effacer
            </button>
          </div>

          {pending && (
            <div className="flex flex-col gap-2.5">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          )}

          {!pending && results.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Aucun process ne correspond.
            </p>
          )}

          {!pending && results.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {results.map((r) => {
                const meta = bySourceId.get(r.source_fiche_id);
                return (
                  <ProcessRow
                    key={r.source_fiche_id}
                    sourceFicheId={r.source_fiche_id}
                    ficheCode={meta?.fiche_code ?? '—'}
                    titre={r.titre}
                    sub={r.snippet}
                    steps={meta?.steps ?? 0}
                    query={submittedQuery}
                    score={r.score}
                  />
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <div className="flex flex-col">
          <section className="mt-10">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-semibold tracking-tight">
                Parcourir par mission
              </h2>
              <span className="text-muted-foreground text-[12.5px]">
                {missions.length} mission{missions.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
              {missions.map((mission) => (
                <MissionTile
                  key={mission.code}
                  mission={mission}
                  active={selectedMission === mission.code}
                  onClick={() => onMissionClick(mission.code)}
                />
              ))}
            </div>
          </section>

          <section ref={listRef} className="mt-10 scroll-mt-6">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-semibold tracking-tight">
                {selectedMissionNom
                  ? `Process — ${selectedMissionNom}`
                  : 'Process finalisés récents'}
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground text-[12.5px]">
                  {filteredAll.length} process
                </span>
                {selectedMission && (
                  <button
                    type="button"
                    onClick={() => setSelectedMission(null)}
                    className="text-primary text-[12.5px]"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>
            {filteredAll.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Aucun process ne correspond.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {filteredAll.map((item) => (
                  <ProcessRow
                    key={item.source_fiche_id}
                    sourceFicheId={item.source_fiche_id}
                    ficheCode={item.fiche_code}
                    titre={item.titre}
                    sub={item.sub}
                    steps={item.steps}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

interface MissionTileProps {
  mission: MissionSummary;
  active: boolean;
  onClick: () => void;
}

function MissionTile({ mission, active, onClick }: MissionTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group border-border bg-card hover:border-foreground/20 relative flex flex-col gap-2.5 overflow-hidden rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md',
        'focus-visible:outline-primary focus-visible:outline-2 focus-visible:outline-offset-2',
        active && 'border-primary ring-primary/20 ring-2',
      )}
    >
      <span
        aria-hidden
        className="bg-primary absolute inset-y-0 left-0 w-[3px] opacity-0 transition group-hover:opacity-90"
      />
      <span className="bg-primary/10 text-primary self-start rounded-md px-2 py-0.5 font-mono text-xs font-semibold tracking-wide">
        {mission.code}
      </span>
      <span className="text-foreground text-[15px] leading-tight font-medium">
        {mission.nom}
      </span>
      <span className="text-muted-foreground mt-auto text-[12.5px]">
        <b className="text-foreground font-semibold tabular-nums">
          {mission.count}
        </b>{' '}
        {mission.count <= 1 ? 'process finalisé' : 'process finalisés'}
      </span>
    </button>
  );
}

interface ProcessRowProps {
  sourceFicheId: string;
  ficheCode: string;
  titre: string;
  sub: string;
  steps: number;
  query?: string;
  score?: number;
}

function ProcessRow({
  sourceFicheId,
  ficheCode,
  titre,
  sub,
  steps,
  query,
  score,
}: ProcessRowProps) {
  return (
    <Link
      href={`/process/fiches/${sourceFicheId}`}
      className="group border-border bg-card focus-visible:outline-primary hover:border-foreground/20 grid grid-cols-[auto_1fr] items-center gap-4 rounded-xl border px-4 py-3.5 text-sm transition hover:-translate-y-px hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 sm:grid-cols-[auto_1fr_auto]"
    >
      <span className="text-muted-foreground bg-muted border-border shrink-0 self-start rounded-lg border px-2.5 py-1.5 font-mono text-xs font-semibold tracking-wide sm:self-center">
        {ficheCode}
      </span>
      <span className="min-w-0">
        <span className="text-foreground block truncate font-semibold tracking-tight">
          {query ? <Highlight text={titre} query={query} /> : titre}
        </span>
        {sub && (
          <span className="text-muted-foreground mt-0.5 block truncate text-[13px]">
            {query ? <Highlight text={sub} query={query} /> : sub}
          </span>
        )}
      </span>
      <span className="text-muted-foreground col-span-2 hidden items-center gap-3.5 text-xs sm:col-span-1 sm:flex">
        {typeof score === 'number' ? (
          <span className="inline-flex items-center gap-1.5" title="Pertinence">
            <span className="bg-muted block h-[5px] w-[42px] overflow-hidden rounded-full">
              <span
                className="bg-primary block h-full rounded-full"
                style={{ width: `${Math.round(score * 100)}%` }}
              />
            </span>
            {Math.round(score * 100)}%
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <b className="text-foreground font-semibold tabular-nums">
              {steps}
            </b>{' '}
            étapes
          </span>
        )}
        <ArrowRight className="text-muted-foreground group-hover:text-primary size-[15px] transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function SkeletonRow() {
  return (
    <div className="border-border bg-card grid animate-pulse grid-cols-[auto_1fr_auto] items-center gap-4 rounded-xl border px-4 py-3.5">
      <span className="bg-muted h-6 w-14 rounded-lg" />
      <span className="flex flex-col gap-2">
        <span className="bg-muted h-4 w-2/3 rounded" />
        <span className="bg-muted h-3 w-1/2 rounded" />
      </span>
      <span className="bg-muted hidden h-4 w-16 rounded sm:block" />
    </div>
  );
}
