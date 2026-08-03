'use client';

import Link from 'next/link';
import { ArrowRight, Loader2, Sparkles, X } from 'lucide-react';
import { ProcessMarkdown } from '@/components/process/process-markdown';

export type ProcessSource = {
  source_fiche_id: string;
  titre: string;
  mission: string;
  url: string;
};

interface ProcessAnswerProps {
  query: string;
  answer: string;
  asking: boolean;
  error: string | null;
  sources: ProcessSource[];
  onClear: () => void;
}

/** Carte « Réponse » (streamée) + liste des sources citées, pour le hub process. */
export function ProcessAnswer({
  query,
  answer,
  asking,
  error,
  sources,
  onClear,
}: ProcessAnswerProps) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <span className="font-semibold">« {query} »</span>
        <button
          type="button"
          onClick={onClear}
          className="text-primary focus-visible:outline-primary ml-auto inline-flex items-center gap-1.5 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <X className="size-3.5" />
          Effacer
        </button>
      </div>

      <div
        aria-live="polite"
        className="border-border bg-card rounded-xl border p-5 shadow-sm"
      >
        <div className="text-primary mb-3 flex items-center gap-2">
          <Sparkles className="size-4" />
          <span className="text-[12.5px] font-semibold tracking-[0.06em] uppercase">
            Réponse
          </span>
        </div>

        {error ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : asking && !answer ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            L&rsquo;assistant lit les process…
          </div>
        ) : (
          <>
            <ProcessMarkdown>{answer}</ProcessMarkdown>
            {asking && answer && (
              <span
                aria-hidden
                className="bg-primary/70 ml-0.5 inline-block h-[1em] w-[2px] animate-pulse align-middle"
              />
            )}
          </>
        )}
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-[15px] font-semibold tracking-tight">
          Sources
        </h2>
        {sources.length === 0 && !asking ? (
          <p className="text-muted-foreground text-sm">
            Aucun process finalisé à citer.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {sources.map((s) => (
              <Link
                key={s.source_fiche_id}
                href={s.url}
                className="group border-border bg-card focus-visible:outline-primary hover:border-foreground/20 flex items-center gap-3 rounded-xl border px-4 py-3.5 text-sm transition hover:-translate-y-px hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-muted-foreground block text-[12.5px]">
                    {s.mission}
                  </span>
                  <span className="text-foreground block truncate font-semibold tracking-tight">
                    {s.titre}
                  </span>
                </span>
                <ArrowRight className="text-muted-foreground group-hover:text-primary size-[15px] shrink-0 transition group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
