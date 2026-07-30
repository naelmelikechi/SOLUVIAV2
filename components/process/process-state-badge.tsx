import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  getTacheState,
  TACHE_STATE_LABEL,
  type TacheStateInput,
} from '@/lib/process/tache-state';

const STATE_CLASS: Record<string, string> = {
  a_faire: 'bg-muted text-muted-foreground',
  en_retard: 'bg-destructive/10 text-destructive',
  realise: 'bg-[var(--orange-bg)] text-orange-700 dark:text-orange-300',
  valide_cdp: 'bg-[var(--purple-bg)] text-[var(--purple)]',
  valide: 'bg-primary text-primary-foreground',
};

export function ProcessStateBadge({
  tache,
  today,
  className,
}: {
  tache: TacheStateInput;
  today: string;
  className?: string;
}) {
  const state = getTacheState(tache, today);
  return (
    <Badge
      variant="outline"
      className={cn('border-transparent', STATE_CLASS[state], className)}
    >
      {TACHE_STATE_LABEL[state]}
    </Badge>
  );
}
