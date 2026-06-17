import { differenceInCalendarDays } from 'date-fns';
import {
  SANTE_PROSPECT_SEUIL_VERT_JOURS,
  SANTE_PROSPECT_SEUIL_ORANGE_JOURS,
  type SanteProspect,
} from '@/lib/utils/constants';

/**
 * Indicateur santé d'un prospect (Feature 1 §5), calculé sur le délai depuis la
 * dernière action commerciale enregistrée (`prospects.derniere_action_at`) :
 *   🟢 vert   : ≤ 7 jours
 *   🟠 orange : 8 à 14 jours
 *   🔴 rouge  : > 14 jours (ou date absente/invalide)
 *
 * Pur et déterministe : `now` est injectable pour les tests.
 */
export function computeSanteProspect(
  derniereActionAt: string | Date | null | undefined,
  now: Date = new Date(),
): SanteProspect {
  if (!derniereActionAt) return 'rouge';
  const d =
    typeof derniereActionAt === 'string'
      ? new Date(derniereActionAt)
      : derniereActionAt;
  if (Number.isNaN(d.getTime())) return 'rouge';

  const jours = differenceInCalendarDays(now, d);
  if (jours <= SANTE_PROSPECT_SEUIL_VERT_JOURS) return 'vert';
  if (jours <= SANTE_PROSPECT_SEUIL_ORANGE_JOURS) return 'orange';
  return 'rouge';
}
