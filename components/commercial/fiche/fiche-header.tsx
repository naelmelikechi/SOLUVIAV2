import { Lock } from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import { ProspectSanteBadge } from '@/components/commercial/prospect-sante-badge';
import {
  STAGE_PROSPECT_LABELS,
  STAGE_PROSPECT_COLORS,
  TYPE_PROSPECT_LABELS,
  type StageProspect,
  type TypeProspect,
} from '@/lib/utils/constants';
import type { ProspectDetail } from '@/lib/queries/prospects';

export function FicheHeader({ prospect }: { prospect: ProspectDetail }) {
  const stage = prospect.stage as StageProspect;
  const locked = prospect.client_id != null;

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{prospect.nom}</h1>
        <StatusBadge
          label={TYPE_PROSPECT_LABELS[prospect.type_prospect as TypeProspect]}
          color="purple"
        />
        <StatusBadge
          label={STAGE_PROSPECT_LABELS[stage] ?? stage}
          color={STAGE_PROSPECT_COLORS[stage] ?? 'gray'}
        />
        <ProspectSanteBadge derniereActionAt={prospect.derniere_action_at} />
      </div>

      <p className="text-muted-foreground mt-1 text-sm">
        {prospect.commercial
          ? `Commercial : ${prospect.commercial.prenom} ${prospect.commercial.nom}`
          : 'Aucun commercial assigné'}
        {prospect.region ? ` · ${prospect.region}` : ''}
      </p>

      {locked && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <Lock className="size-4 shrink-0" />
          <span>
            Fiche verrouillée (client signé)
            {prospect.client?.raison_sociale
              ? ` — ${prospect.client.raison_sociale}`
              : ''}
            . Seuls les points de vigilance et les notes inter-équipe restent
            modifiables.
          </span>
        </div>
      )}
    </div>
  );
}
