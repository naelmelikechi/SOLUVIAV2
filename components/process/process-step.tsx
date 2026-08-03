import { Calendar } from 'lucide-react';
import { DeliverableLink } from '@/components/process/deliverable-link';
import { ProcessMarkdown } from '@/components/process/process-markdown';
import { ProcessTypeBadge } from '@/components/process/process-type-badge';
import { formatEcheance, missionInitials } from '@/lib/process/format';
import { cn } from '@/lib/utils';
import type { FicheDetailTache } from '@/lib/process/types';

interface ProcessStepProps {
  index: number;
  tache: FicheDetailTache;
  isLast: boolean;
}

/** Une étape de la timeline fiche-guide : node numéroté + rail + carte. */
export function ProcessStep({ index, tache, isLast }: ProcessStepProps) {
  const echeance = formatEcheance(tache.echeance);
  return (
    <li className={cn('relative pl-[62px]', isLast ? 'pb-1' : 'pb-6')}>
      {!isLast && (
        <span
          aria-hidden
          className="bg-border absolute top-1.5 bottom-0 left-[21px] w-[2px]"
        />
      )}
      <span
        aria-hidden
        className="bg-card border-border text-muted-foreground absolute top-0 left-1.5 z-10 grid size-[34px] place-items-center rounded-[10px] border font-mono text-[13px] font-semibold shadow-sm"
      >
        {String(index).padStart(2, '0')}
      </span>

      <div className="border-border bg-card rounded-2xl border p-4 transition hover:shadow-sm sm:p-[18px]">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[16px] leading-snug font-semibold tracking-tight">
            {tache.titre}
          </h3>
          <ProcessTypeBadge type={tache.type} />
        </div>

        <div className="text-muted-foreground mt-2.5 flex flex-wrap gap-4 text-[12.5px]">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="bg-primary/10 text-primary grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold tracking-wide"
            >
              {missionInitials(tache.responsable_nom)}
            </span>
            {tache.responsable_nom ?? 'Non assigné'}
          </span>
          {echeance && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-3.5 opacity-85" />
              Échéance <span className="font-mono">{echeance}</span>
            </span>
          )}
        </div>

        {tache.description && (
          <div className="mt-3 max-w-[64ch]">
            <ProcessMarkdown>{tache.description}</ProcessMarkdown>
          </div>
        )}

        {tache.liens.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {tache.liens.map((lien, i) => (
              <DeliverableLink key={i} libelle={lien.libelle} url={lien.url} />
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
