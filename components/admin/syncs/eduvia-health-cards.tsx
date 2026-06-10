import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { EduviaClientHealth } from '@/lib/queries/syncs';
import { SyncStateBadge } from './sync-state-badge';
import { formatDureeMs, formatHorodatage } from './format';

/**
 * Rangee de cards de synthese : une card par client Eduvia surveille
 * (cle API active). Server Component : les libelles relatifs ("il y a 12 min")
 * sont calcules au rendu serveur.
 */
export function EduviaHealthCards({
  health,
}: {
  health: EduviaClientHealth[];
}) {
  if (health.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Aucun client avec une clé API Eduvia active.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {health.map((h) => (
        <Card key={h.clientId} size="sm">
          <CardHeader>
            <CardTitle className="truncate" title={h.clientNom}>
              {h.clientNom}
              {h.trigramme && (
                <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                  {h.trigramme}
                </span>
              )}
            </CardTitle>
            <CardAction>
              <SyncStateBadge state={h.state} />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {h.lastRun ? (
              <>
                <p
                  className="text-muted-foreground text-xs"
                  title={formatHorodatage(h.lastRun.created_at)}
                >
                  Dernier run{' '}
                  {formatDistanceToNow(new Date(h.lastRun.created_at), {
                    addSuffix: true,
                    locale: fr,
                  })}
                  {h.lastRun.duration_ms != null && (
                    <> - durée {formatDureeMs(h.lastRun.duration_ms)}</>
                  )}
                </p>
                {h.lastRun.stats && (
                  <p className="text-sm">
                    {h.lastRun.stats.contrats ?? 0} contrats -{' '}
                    {h.lastRun.stats.apprenants ?? 0} apprenants -{' '}
                    {h.lastRun.stats.invoice_lines ?? 0} lignes de facture
                  </p>
                )}
                {h.lastRun.erreur && (
                  <p
                    className="text-destructive line-clamp-2 text-xs"
                    title={h.lastRun.erreur}
                  >
                    {h.lastRun.erreur}
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-xs">
                Aucun run enregistré pour ce client.
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
