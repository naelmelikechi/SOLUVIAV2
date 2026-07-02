import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';
import { differenceInMonths } from 'date-fns';
import {
  fetchAllPages,
  fetchOne,
  fetchList,
  fetchStatus,
  fetchContractInvoiceLines,
  fetchContractInvoices,
  EndpointNotAvailableError,
  AuthError,
} from '@/lib/eduvia/client';
import type {
  EduviaContract,
  EduviaLearner,
  EduviaFormation,
  EduviaCompany,
  EduviaProgression,
  EduviaInvoiceStep,
  EduviaInvoiceForecastStep,
} from '@/lib/eduvia/client';
import { logger } from '@/lib/utils/logger';
import { decryptApiKey } from '@/lib/utils/encryption';
import {
  detectNpecChangeAjustement,
  detectRuptureAjustement,
} from '@/lib/echeancier/ajustements';
import { isContratRompu } from '@/lib/utils/contrat-states';
import { mapWithConcurrency } from '@/lib/utils/concurrency';
import { chunk } from '@/lib/utils/chunk';

// Les passes par contrat (progressions, invoice steps/lines/forecast) font
// chacune des aller-retours réseau. On traite plusieurs contrats à la fois via
// un petit pool borné : réduit le temps total pour les gros tenants (et le
// risque de timeout 300s) sans marteler l'API Eduvia.
const CONTRACT_SYNC_CONCURRENCY = 5;

// Taille des lots de delete par PK (orphan cleanup). Borne la longueur des URL
// PostgREST : une liste geante d'ids dans `.in('id', ...)` depasse la limite
// serveur. 200 laisse une marge confortable.
const DELETE_CHUNK = 200;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Type alias (pas interface) : assignable a Record<string, Json> pour le
// journal d'audit et la colonne stats jsonb, sans cast.
export type SyncClientResult = {
  clientId: string;
  contrats: number;
  apprenants: number;
  formations: number;
  companies: number;
  progressions: number;
  invoice_steps: number;
  invoice_forecast_steps: number;
  invoice_lines: number;
  /** Steps orphelins supprimes ce run : bordereau Eduvia re-emis avec de
   *  nouveaux step ids, anciens steps retires (hors steps deja factures). */
  invoice_steps_orphan_deleted: number;
  /** Lignes de bordereau orphelines supprimees ce run : l'API Eduvia ne
   *  renvoie plus ces lignes (facture re-emise / ligne retiree). */
  invoice_lines_orphan_deleted: number;
  /** Contrats archivés ce run parce que /contracts ne les renvoie plus (fantômes Eduvia). */
  contrats_archived_orphan: number;
  /** Contrats rattachés au projet fallback faute de mapping eduvia_company_ids (multi-projets). */
  contrats_projet_fallback: number;
  errors: string[];
};

export type SyncResult = {
  totalClients: number;
  syncedClients: number;
  skippedClients: number;
  /** Clients effectivement traites ce run (avant epuisement du budget temps). */
  processed: number;
  /** Clients reportes au prochain run (budget temps epuise). */
  deferred: number;
  results: SyncClientResult[];
  errors: string[];
};

/**
 * Contexte partage entre les passes d'un run client. Chaque fonction d'etape
 * recoit ce contexte et mute `result` en place (compteurs + erreurs) : cela
 * preserve strictement l'ordre d'accumulation des erreurs du code historique,
 * y compris dans les passes concurrentes (mapWithConcurrency).
 */
type ClientSyncContext = {
  supabase: SupabaseClient<Database>;
  clientId: string;
  instanceUrl: string;
  apiKey: string;
  /** Timestamp ISO commun a tous les upserts du run (last_synced_at). */
  now: string;
  /** Compteurs/erreurs du run - mutes en place par chaque passe. */
  result: SyncClientResult;
};

/** Resolution projet par contrat (clients multi-projets). */
type ProjetResolution = {
  fallbackProjetId: string;
  hasMultipleProjets: boolean;
  projetIdByCompany: Map<number, string>;
  resolveProjetId: (companyId: number | null | undefined) => string;
};

/** Snapshot d'un contrat existant en DB avant upsert (detection NPEC/rupture). */
type ContratSnapshot = {
  id: string;
  eduvia_id: number;
  npec_amount: number | null;
  contract_state: string | null;
  archive: boolean | null;
  date_fin: string | null;
};

type NpecChange = { contratId: string; npecActuel: number };
type Rupture = { contratId: string; dateRupture: string };

// ---------------------------------------------------------------------------
// Journal persistant des runs (table eduvia_sync_logs)
// ---------------------------------------------------------------------------

/**
 * Statut d'un run client :
 *  - success : aucune erreur
 *  - partial : erreurs mais du travail a abouti (donnees partiellement a jour)
 *  - error   : erreurs et rien n'a ete synchronise (token refuse, API down...)
 */
export function computeSyncStatut(
  result: SyncClientResult,
): 'success' | 'partial' | 'error' {
  if (result.errors.length === 0) return 'success';
  const work =
    result.contrats + result.apprenants + result.formations + result.companies;
  return work > 0 ? 'partial' : 'error';
}

/**
 * Insere une ligne de journal. Best-effort : un echec d'insert ne doit JAMAIS
 * faire echouer la sync elle-meme (on log et on continue).
 */
async function logSyncRun(
  supabase: SupabaseClient<Database>,
  entry: {
    clientId: string | null;
    statut: 'success' | 'partial' | 'error';
    stats?: SyncClientResult;
    erreur?: string | null;
    durationMs?: number;
  },
): Promise<void> {
  try {
    const { error } = await supabase.from('eduvia_sync_logs').insert({
      client_id: entry.clientId,
      statut: entry.statut,
      // SyncClientResult ne contient que des scalaires JSON-compatibles.
      stats: entry.stats
        ? (JSON.parse(JSON.stringify(entry.stats)) as Json)
        : null,
      erreur: entry.erreur ? entry.erreur.slice(0, 2000) : null,
      duration_ms: entry.durationMs ?? null,
    });
    if (error) {
      logger.warn('eduvia_sync', 'logSyncRun: insert eduvia_sync_logs failed', {
        error: error.message,
        clientId: entry.clientId,
      });
    }
  } catch (err) {
    logger.warn('eduvia_sync', 'logSyncRun threw', {
      error: err instanceof Error ? err.message : String(err),
      clientId: entry.clientId,
    });
  }
}

// ---------------------------------------------------------------------------
// syncEduviaForClient - 3-pass sync:
//   PASS 1: fetch + upsert reference tables (learners, formations, companies).
//   PASS 2: fetch contracts and denormalise names via in-memory lookup maps.
//   PASS 3: per-contract progressions upsert (needs freshly-upserted contrats
//           rows to map eduvia_id -> UUID PK for FK contrat_id).
// ---------------------------------------------------------------------------

export async function syncEduviaForClient(
  supabase: SupabaseClient<Database>,
  clientId: string,
  instanceUrl: string,
  apiKey: string,
): Promise<SyncClientResult> {
  const result: SyncClientResult = {
    clientId,
    contrats: 0,
    apprenants: 0,
    formations: 0,
    companies: 0,
    progressions: 0,
    invoice_steps: 0,
    invoice_forecast_steps: 0,
    invoice_lines: 0,
    invoice_steps_orphan_deleted: 0,
    invoice_lines_orphan_deleted: 0,
    contrats_archived_orphan: 0,
    contrats_projet_fallback: 0,
    errors: [],
  };

  // ── Fetch projets for this client ──────────────────────────────────
  // Note: DB lookups stay outside the try/catch - they're internal checks,
  // not Eduvia fetch failures.
  const { data: projets, error: projetsError } = await supabase
    .from('projets')
    .select('id, client_id, archive, eduvia_company_ids')
    .eq('client_id', clientId)
    .eq('archive', false)
    .eq('est_libre', false);

  if (projetsError) {
    result.errors.push(`Erreur récupération projets: ${projetsError.message}`);
    return result;
  }
  if (!projets || projets.length === 0) {
    result.errors.push(`Aucun projet actif pour le client ${clientId}`);
    return result;
  }

  // ── Résolution projet par contrat (clients multi-projets) ──────────
  const projetResolution = buildProjetResolution(projets);

  try {
    const now = new Date().toISOString();
    const ctx: ClientSyncContext = {
      supabase,
      clientId,
      instanceUrl,
      apiKey,
      now,
      result,
    };

    // ── PRE-CHECK /api/v1/status ───────────────────────────────────────
    // Cheap health + auth probe before we trigger dozens of paginated
    // fetches. Unwrapped response shape { status, version, authenticated }.
    // If authenticated !== 'ok' we bail out with a clear error; if the
    // request itself throws (TLS, network, AuthError), the outer catch
    // below turns it into a descriptive "sync interrompue" entry.
    const status = await fetchStatus(instanceUrl, apiKey);
    if (status.authenticated !== 'ok') {
      result.errors.push(
        `Client ${clientId}: token Eduvia refusé (authenticated=${status.authenticated}, status=${status.status})`,
      );
      logger.warn('eduvia_sync', 'Token Eduvia refusé sur /status', {
        clientId,
        eduviaStatus: status,
      });
      return result;
    }
    logger.info('eduvia_sync', 'Connexion Eduvia OK', {
      clientId,
      eduviaVersion: status.version,
    });

    // ── PASS 1 - reference tables ──────────────────────────────────────
    const { learners, formations, companies } = await fetchReferenceData(ctx);
    await upsertApprenants(ctx, learners);
    await upsertFormations(ctx, formations);
    await upsertCompanies(ctx, companies);

    // In-memory lookups for the denormalised contract columns. Built inside
    // the try block so if any PASS 1 fetch threw above, PASS 2 is skipped
    // entirely rather than running with partial/empty Maps.
    //
    // COUPLAGE INTER-PASSES (a preserver) : un echec non-404 de
    // fetchReferenceData DOIT propager jusqu'au catch de cette fonction et
    // aborter la sync du client AVANT upsertContrats. Sinon PASS 2 tournerait
    // avec des maps vides et ecraserait les colonnes denormalisees
    // (apprenant_nom/prenom, formation_titre) avec NULL. Cf. safeFetchList.
    const learnerById = new Map(learners.map((l) => [l.id, l]));
    const formationById = new Map(formations.map((f) => [f.id, f]));

    // ── PASS 2 - contracts ─────────────────────────────────────────────
    const contracts = await safeFetchList<EduviaContract>(
      () => fetchAllPages<EduviaContract>(instanceUrl, apiKey, 'contracts'),
      'contracts',
    );

    // Snapshot etat actuel pour detecter changements (NPEC, rupture)
    const existingByEduviaId = await snapshotExistingContrats(ctx, contracts);

    // Upsert contrats + collecte des detections (NPEC change / rupture),
    // a appliquer apres les upserts.
    const { npecChanges, ruptures } = await upsertContrats(ctx, contracts, {
      learnerById,
      formationById,
      existingByEduviaId,
      projetResolution,
    });

    await archiveOrphanContrats(ctx, contracts);

    // ── Detection ajustements (NPEC / rupture) post-upsert ─────────────
    await applyAjustementDetections(supabase, npecChanges, ruptures);

    // ── PASS 3 - per-contract progressions ─────────────────────────────
    // Must run AFTER contracts so we can FK contrats_progressions.contrat_id
    // to the freshly-upserted contrats rows.
    const contratIdByEduviaId = await buildContratIdMap(ctx, contracts);
    if (!contratIdByEduviaId) return result;

    await syncProgressions(ctx, contracts, contratIdByEduviaId);

    // ── PASS 4+5 - per-contract invoice steps / lines / forecast ────────
    // Reuses contratIdByEduviaId from PASS 3.
    await syncInvoiceData(ctx, contracts, contratIdByEduviaId);
  } catch (err) {
    // Abort this client's sync on any non-404 fetch failure so we don't
    // corrupt denormalised columns with partial data. AuthError gets a
    // more specific message so the admin knows to rotate the key.
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof AuthError) {
      result.errors.push(
        `Client ${clientId}: erreur d'authentification (${err.status}) - clé API invalide ou révoquée`,
      );
      logger.warn('eduvia_sync', 'Clé API invalide', {
        clientId,
        status: err.status,
      });
    } else {
      result.errors.push(`Client ${clientId}: sync interrompue - ${message}`);
      logger.error('eduvia_sync', err, { clientId, step: 'fetch_failure' });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Fonctions d'etape de syncEduviaForClient (extraction comportementale-neutre)
// ---------------------------------------------------------------------------

/**
 * Resolution projet par contrat (clients multi-projets).
 * Un client peut porter plusieurs projets. On rattache chaque contrat au
 * projet dont `eduvia_company_ids` contient la company Eduvia du contrat.
 * Sans mapping (mono-projet, ou colonne vide), on retombe sur le 1er projet
 * - comportement historique strictement préservé.
 *
 * Precondition : `projets` non vide (verifie par l'appelant).
 */
export function buildProjetResolution(
  projets: Array<{ id: string; eduvia_company_ids: number[] | null }>,
): ProjetResolution {
  const fallbackProjetId = projets[0]!.id;
  const hasMultipleProjets = projets.length > 1;
  const projetIdByCompany = new Map<number, string>();
  for (const p of projets) {
    for (const companyId of p.eduvia_company_ids ?? []) {
      // Number() : PostgREST peut sérialiser bigint[] en strings ; on garde des
      // clés numériques cohérentes avec contract.company_id (number côté API).
      projetIdByCompany.set(Number(companyId), p.id);
    }
  }
  const resolveProjetId = (companyId: number | null | undefined): string => {
    if (companyId != null) {
      const mapped = projetIdByCompany.get(Number(companyId));
      if (mapped) return mapped;
    }
    return fallbackProjetId;
  };
  return {
    fallbackProjetId,
    hasMultipleProjets,
    projetIdByCompany,
    resolveProjetId,
  };
}

/**
 * PASS 1 (fetch) - tables de reference : apprenants, formations, companies.
 * Endpoint /employees (ancienne route /employee_learners toujours live
 * mais vide côté API Eduvia - confirmation Ilies 2026-04-22).
 *
 * 404 degrade en liste vide (safeFetchList) ; toute autre erreur (5xx, auth,
 * reseau) PROPAGE pour aborter la sync du client avant PASS 2 (cf. couplage
 * inter-passes documente dans syncEduviaForClient).
 */
async function fetchReferenceData(ctx: ClientSyncContext): Promise<{
  learners: EduviaLearner[];
  formations: EduviaFormation[];
  companies: EduviaCompany[];
}> {
  const { instanceUrl, apiKey } = ctx;
  const [learners, formations, companies] = await Promise.all([
    safeFetchList<EduviaLearner>(
      () => fetchAllPages<EduviaLearner>(instanceUrl, apiKey, 'employees'),
      'employees',
    ),
    safeFetchList<EduviaFormation>(
      () => fetchAllPages<EduviaFormation>(instanceUrl, apiKey, 'formations'),
      'formations',
    ),
    safeFetchList<EduviaCompany>(
      () => fetchAllPages<EduviaCompany>(instanceUrl, apiKey, 'companies'),
      'companies',
    ),
  ]);
  return { learners, formations, companies };
}

/** PASS 1 (upsert) - apprenants. */
async function upsertApprenants(
  ctx: ClientSyncContext,
  learners: EduviaLearner[],
): Promise<void> {
  const { supabase, clientId, now, result } = ctx;
  for (const learner of learners) {
    // formation_id / internal_number / learning_start/end_date ont quitté
    // la réponse employees ; ils sont désormais portés par les contrats.
    // On les laisse à NULL dans apprenants (les colonnes existent toujours).
    // oxlint-disable-next-line react-doctor/async-await-in-loop
    const { error: upsertError } = await supabase.from('apprenants').upsert(
      {
        eduvia_id: learner.id,
        source_client_id: clientId,
        nom: learner.last_name,
        prenom: learner.first_name,
        gender: learner.gender,
        phone_number: learner.phone_number,
        birth_date: learner.birth_date,
        address: learner.address,
        postcode: learner.postcode,
        city: learner.city,
        nationality_code: learner.nationality_code,
        disabled_worker: learner.disabled_worker,
        status: learner.status,
        last_synced_at: now,
      },
      { onConflict: 'eduvia_id,source_client_id' },
    );
    if (upsertError) {
      result.errors.push(
        `Apprenant eduvia_id=${learner.id}: ${upsertError.message}`,
      );
    } else {
      result.apprenants++;
    }
  }
}

/** PASS 1 (upsert) - formations. */
async function upsertFormations(
  ctx: ClientSyncContext,
  formations: EduviaFormation[],
): Promise<void> {
  const { supabase, clientId, now, result } = ctx;
  for (const formation of formations) {
    // oxlint-disable-next-line react-doctor/async-await-in-loop
    const { error: upsertError } = await supabase.from('formations').upsert(
      {
        eduvia_id: formation.id,
        source_client_id: clientId,
        qualification_title: formation.qualification_title,
        duree: formation.duration?.toString() ?? null,
        rncp: formation.rncp,
        code_diploma: formation.code_diploma,
        diploma_type: formation.diploma_type,
        sequence_count: formation.sequence_count,
        last_synced_at: now,
      },
      { onConflict: 'eduvia_id,source_client_id' },
    );
    if (upsertError) {
      result.errors.push(
        `Formation eduvia_id=${formation.id}: ${upsertError.message}`,
      );
    } else {
      result.formations++;
    }
  }
}

/** PASS 1 (upsert) - companies Eduvia. */
async function upsertCompanies(
  ctx: ClientSyncContext,
  companies: EduviaCompany[],
): Promise<void> {
  const { supabase, clientId, now, result } = ctx;
  for (const company of companies) {
    // oxlint-disable-next-line react-doctor/async-await-in-loop
    const { error: upsertError } = await supabase
      .from('eduvia_companies')
      .upsert(
        {
          eduvia_id: company.id,
          denomination: company.denomination,
          siret: company.siret,
          naf: company.naf,
          address: company.address,
          postcode: company.postcode,
          city: company.city,
          country: company.country,
          employee_count: company.employee_count,
          idcc_code: company.idcc_code,
          employer_type: company.employer_type,
          eduvia_campus_id: company.campus_id,
          client_id: clientId,
          last_synced_at: now,
        },
        { onConflict: 'eduvia_id,client_id' },
      );
    if (upsertError) {
      result.errors.push(
        `Company eduvia_id=${company.id}: ${upsertError.message}`,
      );
    } else {
      result.companies++;
    }
  }
}

/**
 * Snapshot etat actuel des contrats en DB pour detecter les changements
 * (NPEC, rupture) au moment de l'upsert. Scope par source_client_id
 * (anti-collision multi-instances : eduvia_id n'est unique que par client).
 */
async function snapshotExistingContrats(
  ctx: ClientSyncContext,
  contracts: EduviaContract[],
): Promise<Map<number, ContratSnapshot>> {
  const eduviaIds = contracts.map((c) => c.id);
  if (eduviaIds.length === 0) return new Map();
  const { data: existingContrats } = await ctx.supabase
    .from('contrats')
    .select('id, eduvia_id, npec_amount, contract_state, archive, date_fin')
    .in('eduvia_id', eduviaIds)
    .eq('source_client_id', ctx.clientId);
  return new Map(
    (existingContrats ?? []).map((c) => [c.eduvia_id, c] as const),
  );
}

/**
 * Detection pure NPEC change / rupture pour un contrat, en comparant le
 * snapshot DB (`previous`) a l'etat renvoye par l'API Eduvia. C'est cette
 * detection qui alimente les ajustements d'echeancier (facturation) - toute
 * modification ici impacte directement la facturation echeancier.
 */
export function detectContractChanges(
  previous: ContratSnapshot | undefined,
  contract: EduviaContract,
): { npecChange: NpecChange | null; rupture: Rupture | null } {
  if (!previous?.id) return { npecChange: null, rupture: null };

  let npecChange: NpecChange | null = null;
  const oldNpec = Number(previous.npec_amount ?? 0);
  const newNpec = Number(contract.npec_amount ?? 0);
  // Seuil bas (1 centime) : on laisse computeDerivance filtrer le
  // bruit final via son propre seuil delta_ht >= 0.01. Sinon un
  // changement de 0.50 € NPEC ignore ici pourrait quand meme
  // produire un delta cumule > 0.01 (jalons multiples × contrats
  // multiples) qu'on raterait silencieusement.
  if (oldNpec > 0 && newNpec > 0 && Math.abs(oldNpec - newNpec) >= 0.01) {
    npecChange = { contratId: previous.id, npecActuel: newNpec };
  }

  let rupture: Rupture | null = null;
  const wasActive =
    !previous.archive && !isContratRompu(previous.contract_state);
  const isInactive = isContratRompu(contract.contract_state);
  if (wasActive && isInactive) {
    const dateRupture =
      contract.contract_end_date ?? new Date().toISOString().slice(0, 10);
    rupture = { contratId: previous.id, dateRupture };
  }

  return { npecChange, rupture };
}

/**
 * PASS 2 - upsert des contrats + ecriture des colonnes denormalisees
 * (apprenant_nom/prenom, formation_titre) + collecte des detections NPEC /
 * rupture a appliquer post-upsert.
 *
 * COUPLAGE INTER-PASSES (a preserver) : les maps `learnerById` /
 * `formationById` DOIVENT provenir d'un PASS 1 qui a abouti. Si un fetch
 * PASS 1 a echoue (non-404), l'appelant doit aborter AVANT d'appeler cette
 * passe : l'executer avec des maps vides ecraserait les colonnes
 * denormalisees avec NULL (corruption silencieuse). Cf. safeFetchList.
 */
async function upsertContrats(
  ctx: ClientSyncContext,
  contracts: EduviaContract[],
  lookups: {
    learnerById: Map<number, EduviaLearner>;
    formationById: Map<number, EduviaFormation>;
    existingByEduviaId: Map<number, ContratSnapshot>;
    projetResolution: ProjetResolution;
  },
): Promise<{ npecChanges: NpecChange[]; ruptures: Rupture[] }> {
  const { supabase, clientId, now, result } = ctx;
  const { learnerById, formationById, existingByEduviaId, projetResolution } =
    lookups;
  const { hasMultipleProjets, projetIdByCompany, resolveProjetId } =
    projetResolution;

  // Detection a faire apres les upserts
  const npecChanges: NpecChange[] = [];
  const ruptures: Rupture[] = [];

  for (const contract of contracts) {
    try {
      const learner = learnerById.get(contract.employee_id);
      const formation = formationById.get(contract.formation_id);
      const dureeRaw =
        contract.contract_start_date && contract.contract_end_date
          ? differenceInMonths(
              new Date(contract.contract_end_date),
              new Date(contract.contract_start_date),
            )
          : null;
      // Dates Eduvia malformees -> Invalid Date -> differenceInMonths = NaN,
      // qui ferait echouer l'upsert du contrat. On retombe sur null.
      const duree_mois = Number.isFinite(dureeRaw) ? dureeRaw : null;

      // oxlint-disable-next-line react-doctor/async-await-in-loop
      const { error: upsertError } = await supabase.from('contrats').upsert(
        {
          eduvia_id: contract.id,
          source_client_id: clientId,
          projet_id: resolveProjetId(contract.company_id),
          eduvia_employee_id: contract.employee_id,
          eduvia_formation_id: contract.formation_id,
          eduvia_company_id: contract.company_id,
          eduvia_teacher_id: contract.teacher_id,
          eduvia_campus_id: contract.campus_id,
          apprenant_nom: learner?.last_name ?? null,
          apprenant_prenom: learner?.first_name ?? null,
          formation_titre: formation?.qualification_title ?? null,
          date_debut: contract.contract_start_date,
          date_fin: contract.contract_end_date,
          contract_state: contract.contract_state,
          contract_number: contract.contract_number,
          internal_number: contract.internal_number,
          // Codes numeriques cote API (ex 11, 23) stockes en TEXT cote DB,
          // on les normalise en string ici plutot que de laisser Postgres
          // coercer implicitement.
          contract_type:
            contract.contract_type != null
              ? String(contract.contract_type)
              : null,
          contract_mode:
            contract.contract_mode != null
              ? String(contract.contract_mode)
              : null,
          contract_conclusion_date: contract.contract_conclusion_date,
          practical_training_start_date: contract.practical_training_start_date,
          creation_mode: contract.creation_mode,
          npec_amount: contract.npec_amount,
          support: contract.support != null ? Number(contract.support) : null,
          support_first_equipment: contract.support_first_equipment,
          referrer_name: contract.referrer_name,
          referrer_amount: contract.referrer_amount,
          referrer_type: contract.referrer_type,
          accepted_at: contract.accepted_at,
          duree_mois,
          last_synced_at: now,
          archive: false,
        },
        { onConflict: 'eduvia_id,source_client_id' },
      );

      if (upsertError) {
        result.errors.push(
          `Contrat eduvia_id=${contract.id}: ${upsertError.message}`,
        );
      } else {
        result.contrats++;
        if (
          hasMultipleProjets &&
          (contract.company_id == null ||
            !projetIdByCompany.has(contract.company_id))
        ) {
          result.contrats_projet_fallback++;
        }
        // Detection : NPEC change ou rupture
        const { npecChange, rupture } = detectContractChanges(
          existingByEduviaId.get(contract.id),
          contract,
        );
        if (npecChange) npecChanges.push(npecChange);
        if (rupture) ruptures.push(rupture);
      }
    } catch (err) {
      result.errors.push(
        `Contrat eduvia_id=${contract.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { npecChanges, ruptures };
}

/**
 * Orphan cleanup : contrats supprimes cote Eduvia (HTTP 404).
 * L'API Eduvia ne notifie pas les suppressions, on les detecte en
 * comparant la liste des eduvia_id renvoyee par /contracts avec ce que
 * nous avons en DB pour ce source_client_id. Les manquants sont des
 * fantomes (ex : brouillon NOTSENT supprime cote Eduvia, doublon).
 *
 * Garde-fou anti-wipe : si l'API renvoie 0 contrat alors qu'on en a en
 * DB, c'est presque toujours une panne API transitoire. Sans cette
 * protection on archiverait toute la base au prochain run.
 */
async function archiveOrphanContrats(
  ctx: ClientSyncContext,
  contracts: EduviaContract[],
): Promise<void> {
  const { supabase, clientId, now, result } = ctx;

  if (contracts.length > 0) {
    const apiEduviaIds = new Set(contracts.map((c) => c.id));
    // Note: contrats.eduvia_id est NOT NULL en DB, donc pas besoin de
    // filtrer les NULL ici.
    const { data: dbContrats } = await supabase
      .from('contrats')
      .select('id, eduvia_id, ref')
      .eq('source_client_id', clientId)
      .eq('archive', false);

    const orphans = (dbContrats ?? []).filter(
      (c) => c.eduvia_id != null && !apiEduviaIds.has(c.eduvia_id),
    );

    for (const orphan of orphans) {
      // oxlint-disable-next-line react-doctor/async-await-in-loop
      const { error: archiveError } = await supabase
        .from('contrats')
        .update({ archive: true, deleted_in_eduvia_at: now })
        .eq('id', orphan.id);
      if (archiveError) {
        result.errors.push(
          `Archive orphan contrat ${orphan.ref ?? orphan.id}: ${archiveError.message}`,
        );
      } else {
        result.contrats_archived_orphan++;
        logger.info('eduvia_sync', 'contrat fantome archive', {
          clientId,
          contratId: orphan.id,
          ref: orphan.ref,
          eduviaId: orphan.eduvia_id,
        });
      }
    }
  } else {
    logger.warn(
      'eduvia_sync',
      'API contracts vide, orphan cleanup ignore (anti-wipe)',
      { clientId },
    );
  }
}

/**
 * Applique les detections collectees pendant l'upsert des contrats :
 * ajustements d'echeancier NPEC change / rupture. Best-effort par contrat
 * (un echec de detection n'interrompt pas la sync, il est logge Sentry).
 */
async function applyAjustementDetections(
  supabase: SupabaseClient<Database>,
  npecChanges: NpecChange[],
  ruptures: Rupture[],
): Promise<void> {
  for (const { contratId, npecActuel } of npecChanges) {
    try {
      // oxlint-disable-next-line react-doctor/async-await-in-loop
      await detectNpecChangeAjustement(supabase, contratId, npecActuel);
    } catch (err) {
      logger.error('eduvia.sync', 'detect npec ajustement failed', {
        err,
        contratId,
      });
    }
  }
  for (const { contratId, dateRupture } of ruptures) {
    try {
      // oxlint-disable-next-line react-doctor/async-await-in-loop
      await detectRuptureAjustement(supabase, contratId, dateRupture);
    } catch (err) {
      logger.error('eduvia.sync', 'detect rupture ajustement failed', {
        err,
        contratId,
      });
    }
  }
}

/**
 * Lookup eduvia_id -> UUID PK des contrats fraichement upsertes (PASS 2),
 * necessaire pour les FK des passes suivantes (progressions, invoice steps).
 * Scope par source_client_id (anti-collision multi-instances).
 * Retourne null si le lookup echoue : l'appelant doit alors aborter la sync
 * du client (l'erreur est deja poussee dans result.errors).
 */
async function buildContratIdMap(
  ctx: ClientSyncContext,
  contracts: EduviaContract[],
): Promise<Map<number, string> | null> {
  const { supabase, clientId, result } = ctx;
  const { data: syncedContrats, error: contratsLookupError } = await supabase
    .from('contrats')
    .select('id, eduvia_id')
    .in(
      'eduvia_id',
      contracts.map((c) => c.id),
    )
    .eq('source_client_id', clientId);

  if (contratsLookupError) {
    result.errors.push(
      `Erreur lookup contrats pour progressions: ${contratsLookupError.message}`,
    );
    return null;
  }

  return new Map(
    (syncedContrats ?? []).map((c) => [c.eduvia_id, c.id] as const),
  );
}

/** PASS 3 - progressions par contrat (pool concurrent borne). */
async function syncProgressions(
  ctx: ClientSyncContext,
  contracts: EduviaContract[],
  contratIdByEduviaId: Map<number, string>,
): Promise<void> {
  const { supabase, instanceUrl, apiKey, now, result } = ctx;
  await mapWithConcurrency(
    contracts,
    CONTRACT_SYNC_CONCURRENCY,
    async (contract) => {
      const contratId = contratIdByEduviaId.get(contract.id);
      if (!contratId) return;

      try {
        // oxlint-disable-next-line react-doctor/async-await-in-loop
        const progression = await fetchOne<EduviaProgression>(
          instanceUrl,
          apiKey,
          `contracts/${contract.id}/progressions`,
        );

        const { error: upsertError } = await supabase
          .from('contrats_progressions')
          .upsert(
            {
              contrat_id: contratId,
              eduvia_contract_id: progression.contract_id,
              eduvia_formation_id: progression.formation_id,
              total_spent_time_seconds: progression.total_spent_time,
              total_spent_time_hours: progression.total_spent_time_hours,
              completed_sequences_count: progression.completed_sequences_count,
              sequence_count: progression.sequence_count,
              progression_percentage: progression.progression_percentage,
              estimated_relative_time: progression.estimated_relative_time,
              average_score: progression.average_score,
              last_activity_at: progression.last_activity_at,
              sequences: progression.sequences,
              last_synced_at: now,
            },
            { onConflict: 'contrat_id' },
          );

        if (upsertError) {
          result.errors.push(
            `Progression contrat=${contract.id}: ${upsertError.message}`,
          );
        } else {
          result.progressions++;
        }
      } catch (err) {
        if (err instanceof EndpointNotAvailableError) return;
        // Other errors: log the single failure but keep going; we don't
        // abort the whole sync for one flaky progression endpoint.
        result.errors.push(
          `Progression contrat=${contract.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );
}

/**
 * PASS 4+5 - invoice steps (reels + forecast) et lignes de bordereau par
 * contrat, en pool concurrent borne. La passe lignes (PASS 5) n'est declenchee
 * que si au moins un step est emis (invoice_id non null) - meme couverture
 * qu'avant, sans requete superflue pour les contrats pas encore factures.
 */
async function syncInvoiceData(
  ctx: ClientSyncContext,
  contracts: EduviaContract[],
  contratIdByEduviaId: Map<number, string>,
): Promise<void> {
  await mapWithConcurrency(
    contracts,
    CONTRACT_SYNC_CONCURRENCY,
    async (contract) => {
      const contratId = contratIdByEduviaId.get(contract.id);
      if (!contratId) return;

      // Actual invoice steps.
      // Renvoyes par la passe steps pour que la passe lignes (PASS 5) itere
      // sur le meme tableau.
      const steps = await syncContractInvoiceSteps(ctx, contract, contratId);

      // ── PASS 5 - lignes des bordereaux OPCO du contrat ──────────────
      // Endpoint documente contracts/:id/invoice_lines (remplace l'ancien
      // /invoices/:id/lines non documente) : une seule requete renvoie
      // toutes les lignes de tous les bordereaux emis du contrat.
      // Degradation gracieuse sur 404.
      if (steps.some((s) => s.invoice_id != null)) {
        await syncContractInvoiceLines(ctx, contract, contratId);
      }

      // Forecast invoice steps
      await syncContractForecastSteps(ctx, contract, contratId);
    },
  );
}

/**
 * PASS 4 (un contrat) - fetch + upsert des invoice steps reels, avec
 * tracabilite bordereau (n° facture Eduvia + ref OPCO) et orphan cleanup.
 *
 * Garde anti-wipe : si l'API renvoie 0 step alors qu'on en a, on skip
 * (panne transitoire). Garde legale : on ne supprime jamais un step
 * adosse a une ligne de facture live (un event opco_step facture porte
 * event_source_id = eduvia_invoice_steps.id -> tracabilite).
 *
 * Retourne les steps renvoyes par l'API (tableau vide si le fetch a echoue)
 * pour que l'appelant decide de declencher la passe lignes.
 */
async function syncContractInvoiceSteps(
  ctx: ClientSyncContext,
  contract: EduviaContract,
  contratId: string,
): Promise<EduviaInvoiceStep[]> {
  const { supabase, clientId, instanceUrl, apiKey, now, result } = ctx;

  // Hoisted so the caller (PASS 5 line sync) can iterate over the same array
  // even si une etape ulterieure du try a echoue.
  let steps: EduviaInvoiceStep[] = [];
  try {
    // oxlint-disable-next-line react-doctor/async-await-in-loop
    steps = await fetchList<EduviaInvoiceStep>(
      instanceUrl,
      apiKey,
      `contracts/${contract.id}/invoice_steps`,
    );
    // Traçabilité bordereau : map invoice_id -> n° facture Eduvia + réf
    // OPCO, depuis /contracts/:id/invoices. Best-effort (un échec n'empêche
    // pas l'upsert des steps) ; gardé par steps émis pour éviter un appel
    // réseau inutile sur les contrats sans facture.
    const invoiceRefs = new Map<
      number,
      { invoice_number: string | null; external_number: string | null }
    >();
    if (steps.some((s) => s.invoice_id != null)) {
      try {
        // oxlint-disable-next-line react-doctor/async-await-in-loop
        const invoices = await fetchContractInvoices(
          instanceUrl,
          apiKey,
          contract.id,
        );
        for (const inv of invoices) {
          invoiceRefs.set(inv.id, {
            invoice_number: inv.invoice_number,
            external_number: inv.external_number,
          });
        }
      } catch (err) {
        if (!(err instanceof EndpointNotAvailableError)) {
          logger.warn(
            'eduvia_sync',
            `invoices meta contrat=${contract.id} indisponible`,
            { error: err instanceof Error ? err.message : String(err) },
          );
        }
      }
    }
    for (const step of steps) {
      const refs =
        step.invoice_id != null ? invoiceRefs.get(step.invoice_id) : undefined;
      // oxlint-disable-next-line react-doctor/async-await-in-loop
      const { error: upsertError } = await supabase
        .from('eduvia_invoice_steps')
        .upsert(
          {
            eduvia_id: step.id,
            source_client_id: clientId,
            contrat_id: contratId,
            eduvia_contract_id: step.contract_id,
            eduvia_invoice_id: step.invoice_id,
            step_number: step.step_number,
            opening_date: step.opening_date,
            total_amount: step.total_amount,
            including_pedagogie_amount: step.including_pedagogie_amount,
            including_rqth_amount: step.including_rqth_amount,
            paid_amount: step.paid_amount,
            in_progress_amount: step.in_progress_amount,
            opco_settled_amount: step.opco_settled_amount,
            net_invoiced_amount: step.net_invoiced_amount,
            siret_cfa: step.siret_cfa,
            external_code: step.external_code,
            invoice_state: step.invoice_state,
            invoice_sent_at: step.invoice_sent_at,
            paid_at: step.paid_at,
            invoice_number: refs?.invoice_number ?? null,
            external_number: refs?.external_number ?? null,
            last_synced_at: now,
          },
          { onConflict: 'eduvia_id,source_client_id' },
        );
      if (upsertError) {
        result.errors.push(
          `InvoiceStep eduvia_id=${step.id}: ${upsertError.message}`,
        );
      } else {
        result.invoice_steps++;
      }
    }

    // Orphan cleanup au niveau contrat : Eduvia re-emet parfois un
    // bordereau avec de nouveaux step ids, laissant les anciens steps
    // en DB. On retire les steps que l'API ne renvoie plus.
    if (steps.length === 0) {
      const { count: existingCount } = await supabase
        .from('eduvia_invoice_steps')
        .select('id', { count: 'exact', head: true })
        .eq('contrat_id', contratId);
      if ((existingCount ?? 0) > 0) {
        result.errors.push(
          `InvoiceStep orphan cleanup contrat=${contract.id}: API renvoie 0 step mais DB en a ${existingCount}, skip delete pour eviter wipe.`,
        );
      }
    } else {
      // Diff en memoire au lieu de pousser la liste API dans l'URL
      // (NOT IN <api>) : on selectionne les steps du contrat (URL courte)
      // puis on calcule les orphelins localement. Evite le depassement de
      // longueur d'URL PostgREST sur les gros contrats.
      const apiStepIds = new Set(steps.map((s) => s.id));
      const { data: dbSteps, error: stepSelErr } = await supabase
        .from('eduvia_invoice_steps')
        .select('id, eduvia_id')
        .eq('contrat_id', contratId);
      if (stepSelErr) {
        result.errors.push(
          `InvoiceStep orphan cleanup contrat=${contract.id}: ${stepSelErr.message}`,
        );
      } else {
        const orphanStepIds = (dbSteps ?? [])
          .filter((r) => !apiStepIds.has(r.eduvia_id))
          .map((r) => r.id);
        if (orphanStepIds.length > 0) {
          // Garde legale chunkee (meme plafond d'URL que le delete) : on
          // interroge les lignes live par lots d'ids orphelins, puis on
          // agrege les steps factures a conserver.
          const billedStepIds = new Set<string>();
          for (const idsChunk of chunk(orphanStepIds, DELETE_CHUNK)) {
            // oxlint-disable-next-line react-doctor/async-await-in-loop
            const { data: billedLines } = await supabase
              .from('facture_lignes')
              .select('event_source_id')
              .eq('event_type', 'opco_step')
              .eq('est_avoir', false)
              .in('event_source_id', idsChunk);
            for (const l of billedLines ?? []) {
              if (l.event_source_id) billedStepIds.add(l.event_source_id);
            }
          }
          const deletable = orphanStepIds.filter(
            (id) => !billedStepIds.has(id),
          );
          if (billedStepIds.size > 0) {
            logger.info(
              'eduvia_sync',
              'steps orphelins conserves (adosses a une facture)',
              { clientId, contratId, count: billedStepIds.size },
            );
          }
          for (const idsChunk of chunk(deletable, DELETE_CHUNK)) {
            // oxlint-disable-next-line react-doctor/async-await-in-loop
            const { error: deleteErr } = await supabase
              .from('eduvia_invoice_steps')
              .delete()
              .in('id', idsChunk);
            if (deleteErr) {
              result.errors.push(
                `InvoiceStep orphan cleanup contrat=${contract.id}: ${deleteErr.message}`,
              );
            } else {
              result.invoice_steps_orphan_deleted += idsChunk.length;
            }
          }
          if (deletable.length > 0) {
            logger.info('eduvia_sync', 'steps orphelins supprimes', {
              clientId,
              contratId,
              count: deletable.length,
            });
          }
        }
      }
    }
  } catch (err) {
    if (!(err instanceof EndpointNotAvailableError)) {
      result.errors.push(
        `invoice_steps contrat=${contract.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return steps;
}

/**
 * PASS 5 (un contrat) - fetch + upsert des lignes de bordereau OPCO, avec
 * orphan cleanup et garde anti-wipe. Ces lignes portent la base de commission
 * (lignes PEDAGOGIE) : le garde-fou anti-wipe evite d'effacer tout
 * l'historique de commission du contrat sur une panne API transitoire.
 */
async function syncContractInvoiceLines(
  ctx: ClientSyncContext,
  contract: EduviaContract,
  contratId: string,
): Promise<void> {
  const { supabase, clientId, instanceUrl, apiKey, now, result } = ctx;
  try {
    const lines = await fetchContractInvoiceLines(
      instanceUrl,
      apiKey,
      contract.id,
    );

    // Cap erreurs d'upsert : evite le spam si la table refuse en masse.
    const MAX_LINE_ERRORS = 10;
    let lineErrors = 0;
    for (const line of lines) {
      // oxlint-disable-next-line react-doctor/async-await-in-loop
      const { error: lineErr } = await supabase
        .from('eduvia_invoice_lines')
        .upsert(
          {
            eduvia_id: line.id,
            source_client_id: clientId,
            contrat_id: contratId,
            eduvia_invoice_id: line.invoice_id,
            amount: line.amount,
            line_type: line.line_type,
            quantity: line.quantity,
            description: line.description,
            eduvia_created_at: line.created_at,
            eduvia_updated_at: line.updated_at,
            last_synced_at: now,
          },
          { onConflict: 'eduvia_id,source_client_id' },
        );
      if (lineErr) {
        if (lineErrors < MAX_LINE_ERRORS) {
          result.errors.push(
            `InvoiceLine eduvia_id=${line.id}: ${lineErr.message}`,
          );
        }
        lineErrors++;
      } else {
        result.invoice_lines++;
      }
    }
    if (lineErrors > MAX_LINE_ERRORS) {
      result.errors.push(
        `invoice_lines contrat=${contract.id}: ${lineErrors - MAX_LINE_ERRORS} autre(s) erreur(s) d'upsert omise(s)`,
      );
    }

    // Orphan cleanup au niveau contrat : Eduvia ne notifie pas les
    // suppressions de lignes/factures. On retire les lignes encore en
    // DB pour ce contrat que l'API ne renvoie plus (toutes factures
    // confondues). Garde-fou anti-wipe : si l'API renvoie 0 ligne alors
    // qu'on en a en DB, c'est presque toujours une panne transitoire -
    // on skip le delete (sinon NOT IN '(0)' effacerait tout
    // l'historique de commission du contrat).
    if (lines.length === 0) {
      const { count: existingCount } = await supabase
        .from('eduvia_invoice_lines')
        .select('id', { count: 'exact', head: true })
        .eq('contrat_id', contratId);
      if ((existingCount ?? 0) > 0) {
        result.errors.push(
          `InvoiceLine orphan cleanup contrat=${contract.id}: API renvoie 0 ligne mais DB en a ${existingCount}, skip delete pour eviter wipe.`,
        );
      }
    } else {
      // Diff en memoire (comme les steps) : select des lignes du contrat
      // puis calcul des orphelines localement, delete par PK en lots.
      // Evite le NOT IN <api> geant dans l'URL PostgREST.
      const apiLineIds = new Set(lines.map((l) => l.id));
      const { data: dbLines, error: lineSelErr } = await supabase
        .from('eduvia_invoice_lines')
        .select('id, eduvia_id')
        .eq('contrat_id', contratId);
      if (lineSelErr) {
        result.errors.push(
          `InvoiceLine orphan cleanup contrat=${contract.id}: ${lineSelErr.message}`,
        );
      } else {
        const orphanLineIds = (dbLines ?? [])
          .filter((r) => !apiLineIds.has(r.eduvia_id))
          .map((r) => r.id);
        for (const idsChunk of chunk(orphanLineIds, DELETE_CHUNK)) {
          // oxlint-disable-next-line react-doctor/async-await-in-loop
          const { error: deleteErr } = await supabase
            .from('eduvia_invoice_lines')
            .delete()
            .in('id', idsChunk);
          if (deleteErr) {
            result.errors.push(
              `InvoiceLine orphan cleanup contrat=${contract.id}: ${deleteErr.message}`,
            );
          } else {
            result.invoice_lines_orphan_deleted += idsChunk.length;
          }
        }
        if (orphanLineIds.length > 0) {
          logger.info('eduvia_sync', 'lignes orphelines supprimees', {
            clientId,
            contratId,
            count: orphanLineIds.length,
          });
        }
      }
    }
  } catch (err) {
    if (!(err instanceof EndpointNotAvailableError)) {
      result.errors.push(
        `invoice_lines contrat=${contract.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/** PASS 4 (un contrat) - forecast invoice steps. */
async function syncContractForecastSteps(
  ctx: ClientSyncContext,
  contract: EduviaContract,
  contratId: string,
): Promise<void> {
  const { supabase, clientId, instanceUrl, apiKey, now, result } = ctx;
  try {
    const forecasts = await fetchList<EduviaInvoiceForecastStep>(
      instanceUrl,
      apiKey,
      `contracts/${contract.id}/invoice_forecast_steps`,
    );
    for (const forecast of forecasts) {
      // oxlint-disable-next-line react-doctor/async-await-in-loop
      const { error: upsertError } = await supabase
        .from('eduvia_invoice_forecast_steps')
        .upsert(
          {
            eduvia_id: forecast.id,
            source_client_id: clientId,
            contrat_id: contratId,
            eduvia_contract_id: forecast.contract_id,
            step_number: forecast.step_number,
            opening_date: forecast.opening_date,
            total_amount: forecast.total_amount,
            percentage: forecast.percentage,
            npec_amount: forecast.npec_amount,
            last_synced_at: now,
          },
          { onConflict: 'eduvia_id,source_client_id' },
        );
      if (upsertError) {
        result.errors.push(
          `InvoiceForecastStep eduvia_id=${forecast.id}: ${upsertError.message}`,
        );
      } else {
        result.invoice_forecast_steps++;
      }
    }
  } catch (err) {
    if (!(err instanceof EndpointNotAvailableError)) {
      result.errors.push(
        `invoice_forecast_steps contrat=${contract.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// safeFetchList - tolerant wrapper: 404 (endpoint not deployed yet) is silently
// degraded to an empty array. All other errors (5xx, auth, timeouts, network)
// propagate so the caller can abort this client's sync cleanly - otherwise
// PASS 2 would run with empty lookup maps and corrupt the denormalised columns.
// ---------------------------------------------------------------------------

async function safeFetchList<T>(
  fetcher: () => Promise<T[]>,
  label: string,
): Promise<T[]> {
  try {
    return await fetcher();
  } catch (err) {
    if (err instanceof EndpointNotAvailableError) {
      logger.info(
        'eduvia_sync',
        `Endpoint ${label} pas encore disponible - ignoré`,
      );
      return [];
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// syncAllEduviaClients - top-level orchestrator
// ---------------------------------------------------------------------------

/**
 * Budget temps d'un run de syncAllEduviaClients : marge sous les 300s de
 * maxDuration (app/api/sync/eduvia/route.ts et cron eduvia-audit). Au-dela,
 * on arrete PROPREMENT la boucle : les clients restants sont reportes au
 * prochain run horaire, ou ils passeront en tete de liste grace au curseur
 * de rotation last_synced_at (ASC NULLS FIRST).
 */
export const SYNC_TIME_BUDGET_MS = 240_000;

/**
 * Decision pure d'arret sur budget : true quand le temps ecoule depuis le
 * debut du run atteint le budget (les clients restants seront reportes).
 */
export function isSyncBudgetExceeded(
  startedAtMs: number,
  nowMs: number,
  budgetMs: number = SYNC_TIME_BUDGET_MS,
): boolean {
  return nowMs - startedAtMs >= budgetMs;
}

/**
 * Ordonne les cles API par last_synced_at ASC NULLS FIRST (les moins
 * recemment TENTEES d'abord -> rotation anti-famine). Tri stable : les
 * ex-aequo gardent l'ordre de la query. Fait en memoire plutot qu'en SQL :
 * la liste est petite (quelques dizaines de clients max) et la fonction
 * reste pure/testable.
 */
export function orderKeysByLastSyncedAt<
  T extends { last_synced_at: string | null },
>(apiKeys: T[]): T[] {
  return [...apiKeys].sort((a, b) => {
    if (a.last_synced_at == null && b.last_synced_at == null) return 0;
    if (a.last_synced_at == null) return -1;
    if (b.last_synced_at == null) return 1;
    return a.last_synced_at.localeCompare(b.last_synced_at);
  });
}

/**
 * Avance le curseur de rotation last_synced_at pour une cle API, apres
 * chaque client traite (succes OU echec : la rotation doit avancer meme sur
 * les clients en erreur, sinon ils resteraient en tete de liste et
 * re-affameraient les suivants). Best-effort : un echec de l'update ne doit
 * pas faire echouer le run.
 */
async function touchRotationCursor(
  supabase: SupabaseClient<Database>,
  apiKeyId: string,
): Promise<void> {
  const { error } = await supabase
    .from('client_api_keys')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', apiKeyId);
  if (error) {
    logger.warn('eduvia_sync', 'maj last_synced_at (curseur rotation) KO', {
      apiKeyId,
      error: error.message,
    });
  }
}

export async function syncAllEduviaClients(
  supabase: SupabaseClient<Database>,
): Promise<SyncResult> {
  const syncResult: SyncResult = {
    totalClients: 0,
    syncedClients: 0,
    skippedClients: 0,
    processed: 0,
    deferred: 0,
    results: [],
    errors: [],
  };

  const { data: apiKeysRaw, error: fetchError } = await supabase
    .from('client_api_keys')
    .select(
      'id, client_id, api_key_encrypted, instance_url, label, is_active, last_synced_at',
    )
    .eq('is_active', true);

  if (fetchError) {
    syncResult.errors.push(
      `Erreur récupération des clés API: ${fetchError.message}`,
    );
    logger.error('eduvia_sync', fetchError, { step: 'fetch_api_keys' });
    return syncResult;
  }

  if (!apiKeysRaw || apiKeysRaw.length === 0) {
    logger.info('eduvia_sync', 'Aucune clé API active trouvée');
    return syncResult;
  }

  // Rotation anti-famine : les moins recemment tentes d'abord.
  const apiKeys = orderKeysByLastSyncedAt(apiKeysRaw);

  syncResult.totalClients = apiKeys.length;
  const runStartedAt = Date.now();

  for (let i = 0; i < apiKeys.length; i++) {
    // Budget temps : on s'arrete proprement avant le mur maxDuration=300s.
    // Les clients restants (les plus recemment tentes) seront pris au
    // prochain run horaire, en tete de liste grace au curseur de rotation.
    if (isSyncBudgetExceeded(runStartedAt, Date.now())) {
      syncResult.deferred = apiKeys.length - i;
      logger.warn(
        'eduvia_sync',
        'Budget temps epuise, clients reportes au prochain run',
        {
          budgetMs: SYNC_TIME_BUDGET_MS,
          elapsedMs: Date.now() - runStartedAt,
          processed: syncResult.processed,
          deferred: syncResult.deferred,
          deferredClients: apiKeys.slice(i).map((k) => k.client_id),
        },
      );
      break;
    }

    const apiKeyRow = apiKeys[i]!;
    const { client_id, api_key_encrypted, instance_url } = apiKeyRow;

    if (!instance_url) {
      syncResult.skippedClients++;
      syncResult.processed++;
      syncResult.errors.push(
        `Client ${client_id}: Clé API sans URL d'instance, ignorée`,
      );
      logger.warn('eduvia_sync', "Clé API sans URL d'instance, ignorée", {
        clientId: client_id,
      });
      // Rotation : meme une cle mal configuree doit avancer, sinon elle
      // resterait en tete de liste a chaque run.
      await touchRotationCursor(supabase, apiKeyRow.id);
      continue;
    }

    try {
      // Dechiffrement strict: une ligne en plaintext (heritage du fallback
      // desormais supprime) ou une ENCRYPTION_KEY absente fait echouer ce
      // client et on passe au suivant. L'admin doit recreer la cle pour
      // la remettre en service.
      let apiKey: string;
      try {
        apiKey = decryptApiKey(api_key_encrypted);
      } catch (err) {
        logger.error('eduvia_sync', 'dechiffrement cle API impossible', {
          clientId: client_id,
          error: err instanceof Error ? err.message : String(err),
        });
        syncResult.results.push({
          clientId: client_id,
          contrats: 0,
          apprenants: 0,
          formations: 0,
          companies: 0,
          progressions: 0,
          invoice_steps: 0,
          invoice_forecast_steps: 0,
          invoice_lines: 0,
          invoice_steps_orphan_deleted: 0,
          invoice_lines_orphan_deleted: 0,
          contrats_archived_orphan: 0,
          contrats_projet_fallback: 0,
          errors: [
            'Clé API non déchiffrable (ENCRYPTION_KEY manquante ou clé stockée en clair). Recréez la clé pour la réactiver.',
          ],
        });
        await logSyncRun(supabase, {
          clientId: client_id,
          statut: 'error',
          erreur:
            'Clé API non déchiffrable (ENCRYPTION_KEY manquante ou clé stockée en clair).',
        });
        syncResult.processed++;
        await touchRotationCursor(supabase, apiKeyRow.id);
        continue;
      }
      const startedAt = Date.now();
      const clientResult = await syncEduviaForClient(
        supabase,
        client_id,
        instance_url,
        apiKey,
      );

      syncResult.results.push(clientResult);

      await logSyncRun(supabase, {
        clientId: client_id,
        statut: computeSyncStatut(clientResult),
        stats: clientResult,
        erreur: clientResult.errors.join(' | ') || null,
        durationMs: Date.now() - startedAt,
      });

      if (clientResult.errors.length > 0) {
        logger.warn('eduvia_sync', `Sync partielle pour client ${client_id}`, {
          clientId: client_id,
          errors: clientResult.errors,
          contrats: clientResult.contrats,
          apprenants: clientResult.apprenants,
          formations: clientResult.formations,
          companies: clientResult.companies,
          progressions: clientResult.progressions,
          invoice_steps: clientResult.invoice_steps,
          invoice_forecast_steps: clientResult.invoice_forecast_steps,
          invoice_lines: clientResult.invoice_lines,
          invoice_steps_orphan_deleted:
            clientResult.invoice_steps_orphan_deleted,
          contrats_archived_orphan: clientResult.contrats_archived_orphan,
        });
      }

      // last_sync_at (UI, run abouti) + last_synced_at (curseur de rotation)
      // en un seul update. On log l'echec : si le curseur n'avance pas, ce
      // client resterait en tete de rotation et re-affamerait les suivants.
      const { error: cursorError } = await supabase
        .from('client_api_keys')
        .update({
          last_sync_at: new Date().toISOString(),
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', apiKeyRow.id);
      if (cursorError) {
        logger.warn(
          'eduvia_sync',
          'maj last_sync_at/last_synced_at (curseur rotation) KO',
          { apiKeyId: apiKeyRow.id, error: cursorError.message },
        );
      }

      syncResult.syncedClients++;
      syncResult.processed++;

      logger.info('eduvia_sync', `Sync terminée pour client ${client_id}`, {
        clientId: client_id,
        contrats: clientResult.contrats,
        apprenants: clientResult.apprenants,
        formations: clientResult.formations,
        companies: clientResult.companies,
        progressions: clientResult.progressions,
        invoice_steps: clientResult.invoice_steps,
        invoice_forecast_steps: clientResult.invoice_forecast_steps,
        invoice_lines: clientResult.invoice_lines,
        invoice_steps_orphan_deleted: clientResult.invoice_steps_orphan_deleted,
        contrats_archived_orphan: clientResult.contrats_archived_orphan,
      });
    } catch (err) {
      syncResult.skippedClients++;
      syncResult.processed++;
      const message = err instanceof Error ? err.message : String(err);
      syncResult.errors.push(`Client ${client_id}: ${message}`);
      logger.error('eduvia_sync', err, { clientId: client_id });
      await logSyncRun(supabase, {
        clientId: client_id,
        statut: 'error',
        erreur: message,
      });
      // Rotation : l'echec doit quand meme faire avancer le curseur.
      await touchRotationCursor(supabase, apiKeyRow.id);
    }
  }

  logger.info('eduvia_sync', 'Synchronisation Eduvia terminée', {
    totalClients: syncResult.totalClients,
    syncedClients: syncResult.syncedClients,
    skippedClients: syncResult.skippedClients,
    processed: syncResult.processed,
    deferred: syncResult.deferred,
  });

  return syncResult;
}
