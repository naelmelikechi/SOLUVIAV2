import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { StatusBadge, type BadgeColor } from '@/components/shared/status-badge';
import {
  BRAIN_INGEST_STALE_HOURS,
  type BrainIngestHealth,
  type BrainIngestState,
  type BrainIngestStats,
} from '@/lib/queries/syncs';
import { formatDureeMs, formatHorodatage } from './format';

const STATE_BADGES: Record<
  BrainIngestState,
  { label: string; color: BadgeColor }
> = {
  ok: { label: 'À jour', color: 'green' },
  stale: { label: 'À relancer', color: 'orange' },
  failed: { label: 'En échec', color: 'red' },
  never: { label: 'Jamais lancé', color: 'gray' },
};

/**
 * Libelles des statuts bruts de `brain_ingest_runs.statut` (contraints en base
 * a running | success | error). Meme vocabulaire que les autres cartes de
 * /admin/syncs, qui n'affichent jamais la valeur technique telle quelle.
 */
const RUN_STATUT_LABELS: Record<string, string> = {
  running: 'en cours',
  success: 'succès',
  error: 'erreur',
};

const STATE_HINTS: Record<BrainIngestState, string | null> = {
  ok: null,
  stale: `Aucune ingestion réussie depuis plus de ${BRAIN_INGEST_STALE_HOURS / 24} jours : le cerveau n'apprend plus (conversations, entités, obsolescence).`,
  failed: "Le dernier run s'est terminé en erreur.",
  never: "Aucun run journalisé : le script n'a jamais tourné.",
};

/** Compteurs du dernier run réussi, dans l'ordre de la ligne de bilan du script. */
const STAT_LABELS: Array<[keyof BrainIngestStats, string]> = [
  ['fiches', 'Fiches'],
  ['livrables', 'Livrables'],
  ['conversations', 'Conversations'],
  ['entites', 'Entités'],
  ['stale', 'Obsolètes'],
  ['inchanges', 'Inchangés'],
  ['lacunes_ouvertes', 'Lacunes ouvertes'],
];

function dureeRun(run: {
  started_at: string;
  finished_at: string | null;
}): number | null {
  if (!run.finished_at) return null;
  return (
    new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
  );
}

/**
 * Santé du script LOCAL d'ingestion du cerveau (`npm run brain:ingest`).
 * Server Component, même convention de rendu que la card Odoo.
 *
 * L'information mise en avant est l'ANCIENNETÉ du dernier run réussi : le
 * script est lancé à la main, sans rythme imposé, et son absence est
 * silencieuse — c'est elle qu'on veut lire en un coup d'œil, pas la durée.
 */
export function BrainIngestHealthCard({
  health,
}: {
  health: BrainIngestHealth;
}) {
  const badge = STATE_BADGES[health.state];
  const hint = STATE_HINTS[health.state];
  const { lastRun, lastSuccess } = health;
  const stats = lastSuccess?.stats ?? null;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Ingestion du cerveau</CardTitle>
        <CardDescription>
          Script local <code>npm run brain:ingest</code>, lancé à la main
        </CardDescription>
        <CardAction>
          <StatusBadge label={badge.label} color={badge.color} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <p
          className="text-sm font-medium"
          title={formatHorodatage(lastSuccess?.started_at)}
        >
          {lastSuccess
            ? `Dernière ingestion réussie ${formatDistanceToNow(
                new Date(lastSuccess.started_at),
                { addSuffix: true, locale: fr },
              )}`
            : 'Aucune ingestion réussie'}
        </p>

        {hint && (
          <p
            className={
              health.state === 'failed'
                ? 'text-destructive text-xs'
                : 'text-muted-foreground text-xs'
            }
          >
            {hint}
          </p>
        )}

        {lastRun && lastRun.id !== lastSuccess?.id && (
          <p
            className="text-muted-foreground text-xs"
            title={formatHorodatage(lastRun.started_at)}
          >
            Dernier run ({RUN_STATUT_LABELS[lastRun.statut] ?? lastRun.statut}){' '}
            {formatDistanceToNow(new Date(lastRun.started_at), {
              addSuffix: true,
              locale: fr,
            })}
          </p>
        )}

        {lastRun?.erreur && (
          <p
            className="text-destructive max-w-full truncate text-xs"
            title={lastRun.erreur}
          >
            {lastRun.erreur}
          </p>
        )}

        {lastSuccess && (
          <p className="text-muted-foreground text-xs">
            Durée {formatDureeMs(dureeRun(lastSuccess))}
          </p>
        )}

        {stats && (
          <ul className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {STAT_LABELS.filter(([key]) => stats[key] != null).map(
              ([key, label]) => (
                <li key={key}>
                  {label} : <span className="font-medium">{stats[key]}</span>
                </li>
              ),
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
