import { StatusBadge } from '@/components/shared/status-badge';
import { computeSanteProspect } from '@/lib/utils/sante-prospect';
import {
  SANTE_PROSPECT_LABELS,
  SANTE_PROSPECT_COLORS,
} from '@/lib/utils/constants';

/**
 * Pastille santé d'un prospect 🟢🟠🔴 (Feature 1 §5), partagée entre la liste
 * pipeline et la fiche prospect. Calcul dérivé de `derniere_action_at`.
 */
export function ProspectSanteBadge({
  derniereActionAt,
}: {
  derniereActionAt: string | null | undefined;
}) {
  const sante = computeSanteProspect(derniereActionAt);
  return (
    <StatusBadge
      label={SANTE_PROSPECT_LABELS[sante]}
      color={SANTE_PROSPECT_COLORS[sante]}
    />
  );
}
