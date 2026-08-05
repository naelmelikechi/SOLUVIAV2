import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';
import type { SyncClientResult } from '@/lib/eduvia/sync';

// ---------------------------------------------------------------------------
// Sante des synchronisations (page /admin/syncs).
//
// Sources :
//  - eduvia_sync_logs : 1 ligne par client et par run (ecrit par
//    lib/eduvia/sync.ts logSyncRun, statut success | partial | error).
//  - odoo_sync_logs   : 1 ligne par action (direction push | pull,
//    entity_type facture/avoir/paiement/..., statut success | partial |
//    retry | error), ecrit par lib/odoo/sync.ts logSync.
//
// Lecture RLS admin/superadmin uniquement (is_admin()) : pour un non-admin
// ces queries renvoient simplement 0 ligne, la page redirige de toute facon.
// ---------------------------------------------------------------------------

/** Etat derive de la sync d'un client (cf. deriveSyncState). */
export type SyncState = 'ok' | 'degraded' | 'down' | 'stale' | 'never';

/**
 * Fenetre du cron de sync Eduvia (vercel.json `0 9-18 * * *`, heures UTC) :
 * un run par heure pile, de 9h a 18h. La fraicheur se mesure par rapport au
 * dernier creneau ATTENDU, pas en age absolu - sinon la page afficherait
 * "degradee" a tort toute la nuit et chaque matin (aucun run attendu entre
 * 18h et 9h UTC).
 */
export const SYNC_WINDOW_START_UTC = 9;
export const SYNC_WINDOW_END_UTC = 18;

/**
 * Tolerance sous le dernier creneau attendu : 1 creneau complet + 5 min de
 * jitter cron. Equivaut a tolerer au plus un run manquant avant d'alerter
 * (meme comportement que l'ancien seuil de 2h, mais correct hors fenetre).
 */
const SLOT_GRACE_MS = 65 * 60_000;

/**
 * Plus aucun run depuis ce seuil (en heures) = sync interrompue (stale).
 * La sync Eduvia tourne toutes les heures de 9h a 18h, 7j/7 (+ le run
 * d'audit nocturne) : 26h sans AUCUN log couvre largement la fenetre de
 * nuit et signifie que le cron ne tourne plus du tout.
 */
export const SYNC_STALE_HOURS = 26;

/**
 * Dernier creneau cron attendu avant `now` : chaque heure pile de 9h a 18h
 * UTC. Avant 9h -> le 18h de la veille ; apres 18h -> le 18h du jour.
 */
export function lastExpectedSlot(now: Date): Date {
  const slot = new Date(now);
  slot.setUTCMinutes(0, 0, 0);
  const h = now.getUTCHours();
  if (h < SYNC_WINDOW_START_UTC) {
    slot.setUTCDate(slot.getUTCDate() - 1);
    slot.setUTCHours(SYNC_WINDOW_END_UTC);
  } else if (h > SYNC_WINDOW_END_UTC) {
    slot.setUTCHours(SYNC_WINDOW_END_UTC);
  }
  return slot;
}

/** Forme minimale d'un run pour la derivation d'etat. */
export interface SyncRunSummary {
  statut: string;
  created_at: string;
}

/**
 * Derive l'etat de sante d'une sync a partir de son dernier run.
 * Fonction PURE (testee dans __tests__/syncs-health.test.ts) : l'horloge
 * est injectable via `now`.
 *
 *  - never    : aucun run en journal
 *  - down     : le dernier run est en erreur (rien n'a ete synchronise)
 *  - stale    : plus aucun run depuis plus de SYNC_STALE_HOURS - le cron
 *               ne tourne plus (le statut du dernier run importe peu)
 *  - degraded : dernier run partial, ou run(s) manquant(s) par rapport au
 *               dernier creneau cron attendu (fenetre 9h-18h UTC)
 *  - ok       : dernier run success couvrant le dernier creneau attendu
 */
export function deriveSyncState(
  lastRun: SyncRunSummary | null | undefined,
  now: Date = new Date(),
): SyncState {
  if (!lastRun) return 'never';
  const lastRunMs = new Date(lastRun.created_at).getTime();
  const ageHours = (now.getTime() - lastRunMs) / 3_600_000;
  if (lastRun.statut === 'error') return 'down';
  if (ageHours > SYNC_STALE_HOURS) return 'stale';
  if (lastRun.statut === 'partial') return 'degraded';
  const cutoff = lastExpectedSlot(now).getTime() - SLOT_GRACE_MS;
  return lastRunMs >= cutoff ? 'ok' : 'degraded';
}

/**
 * Shape du jsonb eduvia_sync_logs.stats : SyncClientResult serialise par
 * logSyncRun. Partial car un jsonb historique peut ne pas porter tous les
 * compteurs (colonnes ajoutees au fil du temps).
 */
export type EduviaSyncStats = Partial<SyncClientResult>;

export interface EduviaLastRun {
  id: string;
  statut: string;
  created_at: string;
  duration_ms: number | null;
  erreur: string | null;
  stats: EduviaSyncStats | null;
}

export interface EduviaClientHealth {
  clientId: string;
  clientNom: string;
  trigramme: string | null;
  state: SyncState;
  lastRun: EduviaLastRun | null;
}

/** Tri synthese : etats les plus graves d'abord. */
const STATE_SEVERITY: Record<SyncState, number> = {
  down: 0,
  stale: 1,
  degraded: 2,
  never: 3,
  ok: 4,
};

/**
 * Sante de la sync Eduvia, par client surveille.
 *
 * Les clients surveilles = ceux que syncAllEduviaClients traite reellement :
 * une cle API active dans client_api_keys (plusieurs cles actives possibles
 * pour un meme client -> dedupe par client_id, les runs sont journalises par
 * client). Pour chaque client : dernier run + etat derive.
 */
export async function getEduviaSyncHealth(): Promise<EduviaClientHealth[]> {
  const supabase = await createClient();

  const { data: keys, error: keysError } = await supabase
    .from('client_api_keys')
    .select('client_id, client:clients(id, raison_sociale, trigramme)')
    .eq('is_active', true);

  if (keysError) {
    logger.error('queries.syncs', 'getEduviaSyncHealth: cles API KO', {
      error: keysError,
    });
    throw new AppError(
      'SYNCS_FETCH_FAILED',
      'Impossible de charger les clients synchronisés',
      { cause: keysError },
    );
  }

  const clientsById = new Map<
    string,
    { nom: string; trigramme: string | null }
  >();
  for (const key of keys ?? []) {
    if (!clientsById.has(key.client_id)) {
      clientsById.set(key.client_id, {
        nom: key.client?.raison_sociale ?? 'Client inconnu',
        trigramme: key.client?.trigramme ?? null,
      });
    }
  }

  const now = new Date();
  const clientIds = [...clientsById.keys()];

  // Dernier run par client en UNE requete (au lieu d'une requete par client) :
  // PostgREST n'expose pas de DISTINCT ON, on lit donc une fenetre de logs
  // recents tous clients confondus et on garde le premier (le plus recent) de
  // chaque client. La fenetre (~50 runs/client, soit plusieurs jours de cron)
  // couvre largement le dernier run de chaque client dans le cas nominal.
  const windowSize = Math.min(1000, Math.max(200, clientIds.length * 50));
  const { data: recentLogs, error: logsError } = await supabase
    .from('eduvia_sync_logs')
    .select('id, client_id, statut, created_at, duration_ms, erreur, stats')
    .in('client_id', clientIds)
    .order('created_at', { ascending: false })
    .limit(windowSize);

  if (logsError) {
    logger.error('queries.syncs', 'getEduviaSyncHealth: derniers runs KO', {
      error: logsError,
    });
    throw new AppError(
      'SYNCS_FETCH_FAILED',
      'Impossible de charger les journaux de sync Eduvia',
      { cause: logsError },
    );
  }

  type LastRunRow = Omit<EduviaLastRun, 'stats'> & { stats: unknown };
  const lastRunByClient = new Map<string, LastRunRow>();
  for (const log of recentLogs ?? []) {
    if (!log.client_id || lastRunByClient.has(log.client_id)) continue;
    lastRunByClient.set(log.client_id, log);
  }

  // Fenetre saturee ET client absent : son dernier run peut exister au-dela
  // de la fenetre (client tres en retard vs clients bavards). Requete ciblee
  // par client manquant - cas rare, la semantique "never vs stale" est ainsi
  // strictement preservee.
  if ((recentLogs?.length ?? 0) >= windowSize) {
    const missing = clientIds.filter((id) => !lastRunByClient.has(id));
    await Promise.all(
      missing.map(async (clientId) => {
        const { data: lastRun, error: lastRunError } = await supabase
          .from('eduvia_sync_logs')
          .select(
            'id, client_id, statut, created_at, duration_ms, erreur, stats',
          )
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastRunError) {
          logger.error('queries.syncs', 'getEduviaSyncHealth: dernier run KO', {
            clientId,
            error: lastRunError,
          });
          throw new AppError(
            'SYNCS_FETCH_FAILED',
            'Impossible de charger les journaux de sync Eduvia',
            { cause: lastRunError },
          );
        }
        if (lastRun) lastRunByClient.set(clientId, lastRun);
      }),
    );
  }

  const health = [...clientsById.entries()].map(
    ([clientId, info]): EduviaClientHealth => {
      const lastRun = lastRunByClient.get(clientId) ?? null;
      return {
        clientId,
        clientNom: info.nom,
        trigramme: info.trigramme,
        state: deriveSyncState(lastRun, now),
        lastRun: lastRun
          ? {
              id: lastRun.id,
              statut: lastRun.statut,
              created_at: lastRun.created_at,
              duration_ms: lastRun.duration_ms,
              erreur: lastRun.erreur,
              stats: lastRun.stats as EduviaSyncStats | null,
            }
          : null,
      };
    },
  );

  return health.sort(
    (a, b) =>
      STATE_SEVERITY[a.state] - STATE_SEVERITY[b.state] ||
      a.clientNom.localeCompare(b.clientNom, 'fr'),
  );
}

export interface OdooPairHealth {
  direction: string;
  entityType: string;
  statut: string;
  created_at: string | null;
  erreur: string | null;
}

export interface OdooSyncHealth {
  /** Dernier log par couple (direction, entity_type), dans la fenetre scannee. */
  pairs: OdooPairHealth[];
}

/**
 * Fenetre de scan pour la synthese par couple : PostgREST n'expose pas de
 * DISTINCT ON, on derive donc le dernier log de chaque couple des N logs
 * les plus recents. Un couple sans aucun log dans la fenetre (ex : aucune
 * facture poussee depuis longtemps) n'apparait pas dans la synthese.
 */
const ODOO_SCAN_WINDOW = 200;

export async function getOdooSyncHealth(): Promise<OdooSyncHealth> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('odoo_sync_logs')
    .select('id, direction, entity_type, statut, erreur, created_at')
    .order('created_at', { ascending: false })
    .limit(ODOO_SCAN_WINDOW);

  if (error) {
    logger.error('queries.syncs', 'getOdooSyncHealth failed', { error });
    throw new AppError(
      'SYNCS_FETCH_FAILED',
      'Impossible de charger les journaux de sync Odoo',
      { cause: error },
    );
  }

  const byPair = new Map<string, OdooPairHealth>();
  for (const log of data ?? []) {
    const pairKey = `${log.direction}:${log.entity_type}`;
    if (!byPair.has(pairKey)) {
      byPair.set(pairKey, {
        direction: log.direction,
        entityType: log.entity_type,
        statut: log.statut,
        created_at: log.created_at,
        erreur: log.erreur,
      });
    }
  }

  return {
    pairs: [...byPair.values()].sort(
      (a, b) =>
        a.direction.localeCompare(b.direction) ||
        a.entityType.localeCompare(b.entityType),
    ),
  };
}

// ---------------------------------------------------------------------------
// Ingestion du cerveau (scripts/brain-ingest.ts).
//
// Contrairement a Eduvia/Odoo, ce pipeline n'est PAS un cron : il tourne a la
// main sur la machine d'un admin (il lui faut la CLI `claude` authentifiee sur
// un abonnement Max). Il n'y a donc aucun creneau attendu - la seule question
// utile est "a quand remonte le dernier run REUSSI ?", parce qu'un script
// jamais relance fait taire l'apprentissage du cerveau sans le moindre signal.
// ---------------------------------------------------------------------------

/**
 * Au-dela de cette anciennete (en heures) du dernier run REUSSI, la carte
 * alerte. 7 jours : le script est manuel et sans rythme impose, il faut donc
 * un seuil qui tolere le rythme de travail reel (un week-end, un jour ferie,
 * quelques jours de decalage) sans crier au loup - mais qui ne laisse pas
 * passer une semaine entiere de silence. Une semaine pleine sans ingestion,
 * c'est deja une semaine de conversations 👍, d'entites et d'obsolescence non
 * traitees : c'est le moment ou l'oubli devient couteux, pas avant.
 */
export const BRAIN_INGEST_STALE_HOURS = 7 * 24;

/**
 * - never  : aucun run journalise (le script n'a jamais tourne depuis la mise
 *            en place du journal)
 * - failed : le dernier run s'est termine en erreur - a traiter en premier,
 *            meme si un run reussi plus ancien existe
 * - stale  : dernier succes plus vieux que BRAIN_INGEST_STALE_HOURS (ou aucun
 *            succes du tout alors que des runs existent)
 * - ok     : dernier succes recent
 */
export type BrainIngestState = 'ok' | 'stale' | 'failed' | 'never';

/** Forme minimale d'un run pour la derivation d'etat. */
export interface BrainIngestRunSummary {
  statut: string;
  started_at: string;
}

export interface BrainIngestFreshness {
  state: BrainIngestState;
  /** Anciennete du dernier run REUSSI, en heures. null si aucun succes. */
  successAgeHours: number | null;
}

/**
 * Derive l'etat de sante de l'ingestion du cerveau.
 * Fonction PURE (testee dans __tests__/brain-ingest-health.test.ts) :
 * l'horloge est injectable via `now`.
 *
 * Un run `running` (script tue en cours de route, machine fermee) n'est ni un
 * succes ni un echec : il ne fait que ne pas rajeunir le dernier succes, donc
 * l'anciennete finit par declencher `stale`. C'est le comportement voulu - un
 * run interrompu n'a rien appris au cerveau.
 */
export function deriveBrainIngestState(
  lastRun: BrainIngestRunSummary | null | undefined,
  lastSuccess: BrainIngestRunSummary | null | undefined,
  now: Date = new Date(),
): BrainIngestFreshness {
  const successAgeHours = lastSuccess
    ? (now.getTime() - new Date(lastSuccess.started_at).getTime()) / 3_600_000
    : null;
  if (!lastRun) return { state: 'never', successAgeHours };
  if (lastRun.statut === 'error') return { state: 'failed', successAgeHours };
  if (successAgeHours === null || successAgeHours > BRAIN_INGEST_STALE_HOURS) {
    return { state: 'stale', successAgeHours };
  }
  return { state: 'ok', successAgeHours };
}

export interface BrainIngestRun {
  id: string;
  statut: string;
  started_at: string;
  finished_at: string | null;
  erreur: string | null;
  stats: BrainIngestStats | null;
}

/** Compteurs ecrits par le script (cf. RunStats dans scripts/brain-ingest.ts). */
export interface BrainIngestStats {
  fiches?: number;
  livrables?: number;
  conversations?: number;
  entites?: number;
  stale?: number;
  inchanges?: number;
  lacunes_ouvertes?: number;
}

export interface BrainIngestHealth {
  state: BrainIngestState;
  successAgeHours: number | null;
  /** Dernier run, quel que soit son statut. */
  lastRun: BrainIngestRun | null;
  /** Dernier run reussi (peut etre le meme que lastRun). */
  lastSuccess: BrainIngestRun | null;
}

const BRAIN_RUN_COLUMNS = 'id, statut, started_at, finished_at, erreur, stats';

/**
 * Sante du script d'ingestion du cerveau : dernier run + dernier run reussi.
 * Deux lectures ciblees (PostgREST n'expose pas de DISTINCT ON) : le dernier
 * run donne l'echec eventuel, le dernier succes donne l'anciennete utile.
 */
export async function getBrainIngestHealth(): Promise<BrainIngestHealth> {
  const supabase = await createClient();

  const [last, success] = await Promise.all([
    supabase
      .from('brain_ingest_runs')
      .select(BRAIN_RUN_COLUMNS)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('brain_ingest_runs')
      .select(BRAIN_RUN_COLUMNS)
      .eq('statut', 'success')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const error = last.error ?? success.error;
  if (error) {
    logger.error('queries.syncs', 'getBrainIngestHealth failed', { error });
    throw new AppError(
      'SYNCS_FETCH_FAILED',
      "Impossible de charger les runs d'ingestion du cerveau",
      { cause: error },
    );
  }

  const toRun = (
    row: (typeof last)['data'] | (typeof success)['data'],
  ): BrainIngestRun | null =>
    row
      ? {
          id: row.id,
          statut: row.statut,
          started_at: row.started_at,
          finished_at: row.finished_at,
          erreur: row.erreur,
          stats: row.stats as BrainIngestStats | null,
        }
      : null;

  const lastRun = toRun(last.data);
  const lastSuccess = toRun(success.data);
  const { state, successAgeHours } = deriveBrainIngestState(
    lastRun,
    lastSuccess,
  );

  return { state, successAgeHours, lastRun, lastSuccess };
}

export interface RecentSyncRun {
  id: string;
  clientNom: string;
  statut: string;
  created_at: string;
  duration_ms: number | null;
  erreur: string | null;
  stats: EduviaSyncStats | null;
}

/** Les 30 derniers runs Eduvia (tous clients), avec raison sociale. */
export async function getRecentSyncRuns(): Promise<RecentSyncRun[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('eduvia_sync_logs')
    .select(
      'id, statut, created_at, duration_ms, erreur, stats, client:clients(raison_sociale)',
    )
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    logger.error('queries.syncs', 'getRecentSyncRuns failed', { error });
    throw new AppError(
      'SYNCS_FETCH_FAILED',
      'Impossible de charger les derniers runs de sync',
      { cause: error },
    );
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    // client_id est ON DELETE SET NULL : un run peut survivre a son client.
    clientNom: row.client?.raison_sociale ?? 'Client inconnu',
    statut: row.statut,
    created_at: row.created_at,
    duration_ms: row.duration_ms,
    erreur: row.erreur,
    stats: row.stats as EduviaSyncStats | null,
  }));
}
