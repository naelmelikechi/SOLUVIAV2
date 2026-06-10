import { StatusBadge, type BadgeColor } from '@/components/shared/status-badge';
import type { SyncState } from '@/lib/queries/syncs';

const STATE_BADGES: Record<SyncState, { label: string; color: BadgeColor }> = {
  ok: { label: 'Opérationnelle', color: 'green' },
  degraded: { label: 'Dégradée', color: 'orange' },
  down: { label: 'En échec', color: 'red' },
  stale: { label: 'Interrompue', color: 'red' },
  never: { label: 'Jamais synchronisé', color: 'gray' },
};

/** Badge colore de l'etat derive d'une sync (vert/orange/rouge/gris). */
export function SyncStateBadge({ state }: { state: SyncState }) {
  const badge = STATE_BADGES[state];
  return <StatusBadge label={badge.label} color={badge.color} />;
}
