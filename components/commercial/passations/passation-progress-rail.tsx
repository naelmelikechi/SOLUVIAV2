import { Check } from 'lucide-react';
import type { StatutSynthese } from '@/lib/utils/constants';
import { cn } from '@/lib/utils';

// Rail de progression du dossier de passation : rend lisible la machine à
// états (brouillon -> transmis au référent -> CDP affecté -> archivé) sans
// toucher à la logique. Les alias legacy diffusee_vague1/2 mappent sur les
// mêmes étapes que en_attente_arbitrage / cdp_affecte.
const STEPS = [
  { key: 'completion', label: 'Complétion' },
  { key: 'arbitrage', label: 'Transmis au référent' },
  { key: 'cdp', label: 'CDP affecté' },
  { key: 'archivee', label: 'Archivé' },
] as const;

const STATUT_TO_STEP: Record<StatutSynthese, number> = {
  generee: 0,
  en_cours_completion: 0,
  en_attente_arbitrage: 1,
  diffusee_vague1: 1,
  cdp_affecte: 2,
  diffusee_vague2: 2,
  archivee: 3,
};

export function PassationProgressRail({ statut }: { statut: StatutSynthese }) {
  const current = STATUT_TO_STEP[statut] ?? 0;
  return (
    <ol
      aria-label="Avancement de la passation"
      className="flex flex-wrap items-center gap-1.5 text-xs"
    >
      {STEPS.map((step, i) => {
        const done = i < current || statut === 'archivee';
        const active = i === current && statut !== 'archivee';
        return (
          <li key={step.key} className="flex items-center gap-1.5">
            {i > 0 && <span className="bg-border h-px w-4" aria-hidden />}
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
                done && 'bg-primary/10 text-primary',
                active && 'bg-primary text-primary-foreground',
                !done && !active && 'bg-muted text-muted-foreground',
              )}
            >
              {done && <Check className="size-3" />}
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
