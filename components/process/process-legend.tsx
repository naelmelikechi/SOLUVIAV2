import { TACHE_STATE_LABEL, type TacheState } from '@/lib/process/tache-state';

const ORDER: TacheState[] = [
  'a_faire',
  'en_retard',
  'realise',
  'valide_cdp',
  'valide',
];

// Pastilles pleines dérivées des mêmes familles de couleur que
// ProcessStateBadge (STATE_CLASS), mais en teinte pleine plutôt qu'en fond
// pastel : un fond de badge (ex. bg-destructive/10) serait invisible en
// pastille de 8px.
const DOT_CLASS: Record<TacheState, string> = {
  a_faire: 'bg-muted-foreground',
  en_retard: 'bg-destructive',
  realise: 'bg-orange-600 dark:bg-orange-400',
  valide_cdp: 'bg-[var(--purple)]',
  valide: 'bg-primary',
};

/** Légende statique des 5 états de tâche (mêmes couleurs que ProcessStateBadge). */
export function ProcessLegend() {
  return (
    <div className="flex flex-wrap gap-3">
      {ORDER.map((state) => (
        <span
          key={state}
          className="text-muted-foreground inline-flex items-center gap-1.5 text-xs"
        >
          <span className={`size-2 rounded-full ${DOT_CLASS[state]}`} />
          {TACHE_STATE_LABEL[state]}
        </span>
      ))}
    </div>
  );
}
