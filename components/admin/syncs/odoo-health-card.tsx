import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { StatusBadge, type BadgeColor } from '@/components/shared/status-badge';
import type { OdooSyncHealth } from '@/lib/queries/syncs';
import { formatHorodatage } from './format';

const STATUT_BADGES: Record<string, { label: string; color: BadgeColor }> = {
  success: { label: 'Succès', color: 'green' },
  partial: { label: 'Partiel', color: 'orange' },
  retry: { label: 'Retry', color: 'orange' },
  error: { label: 'Erreur', color: 'red' },
};

const DIRECTION_LABELS: Record<string, string> = {
  push: 'Push',
  pull: 'Pull',
};

const ENTITY_LABELS: Record<string, string> = {
  facture: 'Factures',
  avoir: 'Avoirs',
  paiement: 'Paiements',
  bank_unreconciled: 'Rapprochement bancaire',
  cancellation: 'Annulations',
};

/**
 * Synthese Odoo : dernier log par couple (direction, entity_type).
 * Server Component, meme convention de rendu que les cards Eduvia.
 */
export function OdooHealthCard({ health }: { health: OdooSyncHealth }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Synchronisation Odoo</CardTitle>
        <CardDescription>
          Dernier log par flux (direction / type d&apos;entité)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {health.pairs.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucun log de synchronisation Odoo.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {health.pairs.map((pair) => {
              const badge = STATUT_BADGES[pair.statut] ?? {
                label: pair.statut,
                color: 'gray' as const,
              };
              return (
                <li
                  key={`${pair.direction}:${pair.entityType}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0"
                >
                  <span className="min-w-44 text-sm font-medium">
                    {DIRECTION_LABELS[pair.direction] ?? pair.direction} -{' '}
                    {ENTITY_LABELS[pair.entityType] ?? pair.entityType}
                  </span>
                  <StatusBadge label={badge.label} color={badge.color} />
                  <span
                    className="text-muted-foreground text-xs"
                    title={formatHorodatage(pair.created_at)}
                  >
                    {pair.created_at
                      ? formatDistanceToNow(new Date(pair.created_at), {
                          addSuffix: true,
                          locale: fr,
                        })
                      : '-'}
                  </span>
                  {pair.erreur && (
                    <span
                      className="text-destructive max-w-full truncate text-xs"
                      title={pair.erreur}
                    >
                      {pair.erreur}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
