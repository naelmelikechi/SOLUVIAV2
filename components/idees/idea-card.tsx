'use client';

import { User, CheckCircle, Rocket, XCircle } from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import { CIBLE_IDEE_LABELS, CIBLE_IDEE_COLORS } from '@/lib/utils/constants';
import { formatDateLong } from '@/lib/utils/formatters';
import type { IdeeWithRefs } from '@/lib/queries/idees';

interface IdeaCardProps {
  idee: IdeeWithRefs;
  onClick: () => void;
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

export function IdeaCard({ idee, onClick }: IdeaCardProps) {
  const StatutIcon = STATUT_ICONS[idee.statut];
  const iconColor = STATUT_ICON_COLORS[idee.statut];

  return (
    <button
      type="button"
      onClick={onClick}
      className="group bg-card border-border hover:border-primary/40 w-full rounded-md border p-3 text-left transition-all duration-150 hover:-translate-y-px hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
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
    </button>
  );
}
