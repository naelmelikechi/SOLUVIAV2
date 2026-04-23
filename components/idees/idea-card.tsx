'use client';

import { useTransition } from 'react';
import {
  User,
  CheckCircle,
  Rocket,
  XCircle,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import { CIBLE_IDEE_LABELS, CIBLE_IDEE_COLORS } from '@/lib/utils/constants';
import { formatDateLong } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { validateIdea, markIdeaImplemented } from '@/lib/actions/idees';
import { toast } from 'sonner';
import type { IdeeWithRefs } from '@/lib/queries/idees';

interface IdeaCardProps {
  idee: IdeeWithRefs;
  onClick: () => void;
  canModerate?: boolean;
  canShip?: boolean;
  onValidated?: (id: string) => void;
  onImplemented?: (id: string) => void;
  onRevert?: (id: string) => void;
  onRequestReject?: (idee: IdeeWithRefs) => void;
}

const STATUT_ICONS = {
  proposee: null,
  validee: CheckCircle,
  implementee: Rocket,
  rejetee: XCircle,
} as const;

const STATUT_ICON_COLORS = {
  proposee: '',
  validee: 'text-blue-600',
  implementee: 'text-green-600',
  rejetee: 'text-red-500',
} as const;

export function IdeaCard({
  idee,
  onClick,
  canModerate = false,
  canShip = false,
  onValidated,
  onImplemented,
  onRevert,
  onRequestReject,
}: IdeaCardProps) {
  const [isPending, startTransition] = useTransition();
  const StatutIcon = STATUT_ICONS[idee.statut];
  const iconColor = STATUT_ICON_COLORS[idee.statut];

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
  }

  function handleValidate(e: React.MouseEvent) {
    e.stopPropagation();
    onValidated?.(idee.id);
    startTransition(async () => {
      const r = await validateIdea(idee.id);
      if (!r.success) {
        onRevert?.(idee.id);
        toast.error(r.error ?? 'Erreur');
        return;
      }
      toast.success('Idée validée');
    });
  }

  function handleImplement(e: React.MouseEvent) {
    e.stopPropagation();
    onImplemented?.(idee.id);
    startTransition(async () => {
      const r = await markIdeaImplemented(idee.id);
      if (!r.success) {
        onRevert?.(idee.id);
        toast.error(r.error ?? 'Erreur');
        return;
      }
      toast.success('Idée marquée comme implémentée');
    });
  }

  function handleReject(e: React.MouseEvent) {
    e.stopPropagation();
    onRequestReject?.(idee);
  }

  const showProposeeActions = canModerate && idee.statut === 'proposee';
  const showValideeAction = canShip && idee.statut === 'validee';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'group bg-card border-border hover:border-primary/40 relative w-full cursor-pointer rounded-md border p-3 text-left transition-all duration-150 hover:-translate-y-px hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
        isPending && 'pointer-events-none opacity-60',
      )}
    >
      <div className="flex items-start gap-2">
        {StatutIcon && (
          <StatutIcon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${iconColor}`} />
        )}
        <h4 className="line-clamp-2 flex-1 text-[13px] leading-tight font-semibold">
          {idee.titre}
        </h4>
      </div>

      {idee.description && (
        <p className="text-muted-foreground mt-1.5 line-clamp-2 text-[11px]">
          {idee.description}
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <StatusBadge
          label={CIBLE_IDEE_LABELS[idee.cible]}
          color={CIBLE_IDEE_COLORS[idee.cible]}
        />
        {idee.auteur && (
          <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
            <User className="h-3 w-3" />
            {idee.auteur.prenom}
          </span>
        )}
      </div>

      <div className="text-muted-foreground mt-1.5 text-[10px]">
        {formatDateLong(idee.created_at)}
      </div>

      {(showProposeeActions || showValideeAction) && (
        <div
          className="border-border/60 mt-2.5 flex gap-1.5 border-t pt-2.5"
          onClick={stop}
        >
          {isPending ? (
            <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px]">
              <Loader2 className="h-3 w-3 animate-spin" />
              En cours...
            </span>
          ) : (
            <>
              {showProposeeActions && (
                <>
                  <button
                    type="button"
                    onClick={handleValidate}
                    className="inline-flex items-center gap-1 rounded border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-500/20 dark:text-blue-400"
                  >
                    <ArrowRight className="h-3 w-3" />
                    Valider
                  </button>
                  <button
                    type="button"
                    onClick={handleReject}
                    className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-700 transition-colors hover:bg-red-500/20 dark:text-red-400"
                  >
                    <XCircle className="h-3 w-3" />
                    Rejeter
                  </button>
                </>
              )}
              {showValideeAction && (
                <button
                  type="button"
                  onClick={handleImplement}
                  className="inline-flex items-center gap-1 rounded border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-700 transition-colors hover:bg-green-500/20 dark:text-green-400"
                >
                  <Rocket className="h-3 w-3" />
                  Implémenter
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
