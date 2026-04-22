import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';
import { differenceInMonths } from 'date-fns';
import {
  fetchAllPages,
  fetchOne,
  fetchList,
  fetchStatus,
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncClientResult {
  clientId: string;
  contrats: number;
  apprenants: number;
  formations: number;
  companies: number;
  progressions: number;
  invoice_steps: number;
  invoice_forecast_steps: number;
  errors: string[];
}

export interface SyncResult {
  totalClients: number;
  syncedClients: number;
  skippedClients: number;
  results: SyncClientResult[];
  errors: string[];
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
    errors: [],
  };

  // ── Fetch projets for this client ──────────────────────────────────
  // Note: DB lookups stay outside the try/catch - they're internal checks,
  // not Eduvia fetch failures.
  const { data: projets, error: projetsError } = await supabase
    .from('projets')
    .select('id, client_id, archive')
    .eq('client_id', clientId)
    .eq('archive', false);

  if (projetsError) {
    result.errors.push(`Erreur récupération projets: ${projetsError.message}`);
    return result;
  }
  if (!projets || projets.length === 0) {
    result.errors.push(`Aucun projet actif pour le client ${clientId}`);
    return result;
  }

  // Multi-projet clients: v1 uses the first non-archived projet as fallback.
  // A future migration may hang contrats.projet_id resolution on a
  // projets.eduvia_company_ids mapping so we can pick the right one per
  // contract. Documented in the plan's follow-ups section.
  const fallbackProjetId = projets[0]!.id;

  try {
    const now = new Date().toISOString();

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
    // Endpoint /employees (ancienne route /employee_learners toujours live
    // mais vide côté API Eduvia — confirmation Ilies 2026-04-22).
    const learners = await safeFetchList<EduviaLearner>(
      () => fetchAllPages<EduviaLearner>(instanceUrl, apiKey, 'employees'),
      'employees',
    );
    const formations = await safeFetchList<EduviaFormation>(
      () => fetchAllPages<EduviaFormation>(instanceUrl, apiKey, 'formations'),
      'formations',
    );
    const companies = await safeFetchList<EduviaCompany>(
      () => fetchAllPages<EduviaCompany>(instanceUrl, apiKey, 'companies'),
      'companies',
    );

    for (const learner of learners) {
      // formation_id / internal_number / learning_start/end_date ont quitté
      // la réponse employees ; ils sont désormais portés par les contrats.
      // On les laisse à NULL dans apprenants (les colonnes existent toujours).
      const { error: upsertError } = await supabase.from('apprenants').upsert(
        {
          eduvia_id: learner.id,
          nom: learner.last_name,
          prenom: learner.first_name,
          gender: learner.gender,
          phone_number: learner.phone_number,
          last_synced_at: now,
        },
        { onConflict: 'eduvia_id' },
      );
      if (upsertError) {
        result.errors.push(
          `Apprenant eduvia_id=${learner.id}: ${upsertError.message}`,
        );
      } else {
        result.apprenants++;
      }
    }

    for (const formation of formations) {
      const { error: upsertError } = await supabase.from('formations').upsert(
        {
          eduvia_id: formation.id,
          // Keep the legacy `titre` column populated for existing queries; the
          // new `qualification_title` column mirrors the real API field name.
          // TODO(drop-legacy-2026-09): remove once all queries migrate to qualification_title.
          titre: formation.qualification_title,
          qualification_title: formation.qualification_title,
          duree: formation.duration?.toString() ?? null,
          rncp: formation.rncp,
          code_diploma: formation.code_diploma,
          diploma_type: formation.diploma_type,
          sequence_count: formation.sequence_count,
          last_synced_at: now,
        },
        { onConflict: 'eduvia_id' },
      );
      if (upsertError) {
        result.errors.push(
          `Formation eduvia_id=${formation.id}: ${upsertError.message}`,
        );
      } else {
        result.formations++;
      }
    }

    for (const company of companies) {
      const { error: upsertError } = await supabase
        .from('eduvia_companies')
        .upsert(
          {
            eduvia_id: company.id,
            // Keep the legacy `name` column populated; `denomination` mirrors the real API.
            // TODO(drop-legacy-2026-09): remove once all queries migrate to denomination.
            name: company.denomination,
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
          { onConflict: 'eduvia_id' },
        );
      if (upsertError) {
        result.errors.push(
          `Company eduvia_id=${company.id}: ${upsertError.message}`,
        );
      } else {
        result.companies++;
      }
    }

    // In-memory lookups for the denormalised contract columns. Built inside
    // the try block so if any PASS 1 fetch threw above, PASS 2 is skipped
    // entirely rather than running with partial/empty Maps.
    const learnerById = new Map(learners.map((l) => [l.id, l]));
    const formationById = new Map(formations.map((f) => [f.id, f]));

    // ── PASS 2 - contracts ─────────────────────────────────────────────
    const contracts = await safeFetchList<EduviaContract>(
      () => fetchAllPages<EduviaContract>(instanceUrl, apiKey, 'contracts'),
      'contracts',
    );

    for (const contract of contracts) {
      try {
        const learner = learnerById.get(contract.employee_id);
        const formation = formationById.get(contract.formation_id);
        const duree_mois =
          contract.contract_start_date && contract.contract_end_date
            ? differenceInMonths(
                new Date(contract.contract_end_date),
                new Date(contract.contract_start_date),
              )
            : null;

        const { error: upsertError } = await supabase.from('contrats').upsert(
          {
            eduvia_id: contract.id,
            projet_id: fallbackProjetId,
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
            contract_type: contract.contract_type,
            contract_mode: contract.contract_mode,
            contract_conclusion_date: contract.contract_conclusion_date,
            practical_training_start_date:
              contract.practical_training_start_date,
            creation_mode: contract.creation_mode,
            // Keep legacy column montant_prise_en_charge populated from npec_amount
            // so downstream queries don't break.
            // TODO(drop-legacy-2026-09): remove once all queries migrate to npec_amount.
            montant_prise_en_charge: contract.npec_amount,
            npec_amount: contract.npec_amount,
            referrer_name: contract.referrer_name,
            referrer_amount: contract.referrer_amount,
            referrer_type: contract.referrer_type,
            accepted_at: contract.accepted_at,
            duree_mois,
            last_synced_at: now,
            archive: false,
          },
          { onConflict: 'eduvia_id' },
        );

        if (upsertError) {
          result.errors.push(
            `Contrat eduvia_id=${contract.id}: ${upsertError.message}`,
          );
        } else {
          result.contrats++;
        }
      } catch (err) {
        result.errors.push(
          `Contrat eduvia_id=${contract.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // ── PASS 3 - per-contract progressions ─────────────────────────────
    // Must run AFTER contracts so we can FK contrats_progressions.contrat_id
    // to the freshly-upserted contrats rows.
    const { data: syncedContrats, error: contratsLookupError } = await supabase
      .from('contrats')
      .select('id, eduvia_id')
      .in(
        'eduvia_id',
        contracts.map((c) => c.id),
      );

    if (contratsLookupError) {
      result.errors.push(
        `Erreur lookup contrats pour progressions: ${contratsLookupError.message}`,
      );
      return result;
    }

    const contratIdByEduviaId = new Map(
      (syncedContrats ?? []).map((c) => [c.eduvia_id, c.id] as const),
    );

    for (const contract of contracts) {
      const contratId = contratIdByEduviaId.get(contract.id);
      if (!contratId) continue;

      try {
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
              sequences: progression.sequences as unknown as Json,
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
        if (err instanceof EndpointNotAvailableError) continue;
        // Other errors: log the single failure but keep going; we don't
        // abort the whole sync for one flaky progression endpoint.
        result.errors.push(
          `Progression contrat=${contract.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // ── PASS 4 - per-contract invoice steps (actual + forecast) ─────────
    // Reuses contratIdByEduviaId from PASS 3.
    for (const contract of contracts) {
      const contratId = contratIdByEduviaId.get(contract.id);
      if (!contratId) continue;

      // Actual invoice steps
      try {
        const steps = await fetchList<EduviaInvoiceStep>(
          instanceUrl,
          apiKey,
          `contracts/${contract.id}/invoice_steps`,
        );
        for (const step of steps) {
          const { error: upsertError } = await supabase
            .from('eduvia_invoice_steps')
            .upsert(
              {
                eduvia_id: step.id,
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
                siret_cfa: step.siret_cfa,
                external_code: step.external_code,
                invoice_state: step.invoice_state,
                invoice_sent_at: step.invoice_sent_at,
                paid_at: step.paid_at,
                last_synced_at: now,
              },
              { onConflict: 'eduvia_id' },
            );
          if (upsertError) {
            result.errors.push(
              `InvoiceStep eduvia_id=${step.id}: ${upsertError.message}`,
            );
          } else {
            result.invoice_steps++;
          }
        }
      } catch (err) {
        if (!(err instanceof EndpointNotAvailableError)) {
          result.errors.push(
            `invoice_steps contrat=${contract.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Forecast invoice steps
      try {
        const forecasts = await fetchList<EduviaInvoiceForecastStep>(
          instanceUrl,
          apiKey,
          `contracts/${contract.id}/invoice_forecast_steps`,
        );
        for (const forecast of forecasts) {
          const { error: upsertError } = await supabase
            .from('eduvia_invoice_forecast_steps')
            .upsert(
              {
                eduvia_id: forecast.id,
                contrat_id: contratId,
                eduvia_contract_id: forecast.contract_id,
                step_number: forecast.step_number,
                opening_date: forecast.opening_date,
                total_amount: forecast.total_amount,
                percentage: forecast.percentage,
                npec_amount: forecast.npec_amount,
                last_synced_at: now,
              },
              { onConflict: 'eduvia_id' },
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
// syncAllEduviaClients - top-level orchestrator (unchanged flow)
// ---------------------------------------------------------------------------

export async function syncAllEduviaClients(
  supabase: SupabaseClient<Database>,
): Promise<SyncResult> {
  const syncResult: SyncResult = {
    totalClients: 0,
    syncedClients: 0,
    skippedClients: 0,
    results: [],
    errors: [],
  };

  const { data: apiKeys, error: fetchError } = await supabase
    .from('client_api_keys')
    .select('id, client_id, api_key_encrypted, instance_url, label, is_active')
    .eq('is_active', true);

  if (fetchError) {
    syncResult.errors.push(
      `Erreur récupération des clés API: ${fetchError.message}`,
    );
    logger.error('eduvia_sync', fetchError, { step: 'fetch_api_keys' });
    return syncResult;
  }

  if (!apiKeys || apiKeys.length === 0) {
    logger.info('eduvia_sync', 'Aucune clé API active trouvée');
    return syncResult;
  }

  syncResult.totalClients = apiKeys.length;

  for (const apiKeyRow of apiKeys) {
    const { client_id, api_key_encrypted, instance_url } = apiKeyRow;

    if (!instance_url) {
      syncResult.skippedClients++;
      syncResult.errors.push(
        `Client ${client_id}: Clé API sans URL d'instance, ignorée`,
      );
      logger.warn('eduvia_sync', "Clé API sans URL d'instance, ignorée", {
        clientId: client_id,
      });
      continue;
    }

    try {
      // Mirror testApiKeyConnection's behavior: if ENCRYPTION_KEY is not set
      // or the stored value isn't in the iv:authTag:ciphertext format, treat
      // the column as plaintext (addClientApiKey falls back to plaintext on
      // insert when ENCRYPTION_KEY is missing, so this keeps parity).
      let apiKey: string;
      try {
        apiKey = decryptApiKey(api_key_encrypted);
      } catch {
        apiKey = api_key_encrypted;
      }
      const clientResult = await syncEduviaForClient(
        supabase,
        client_id,
        instance_url,
        apiKey,
      );

      syncResult.results.push(clientResult);

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
        });
      }

      await supabase
        .from('client_api_keys')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', apiKeyRow.id);

      syncResult.syncedClients++;

      logger.info('eduvia_sync', `Sync terminée pour client ${client_id}`, {
        clientId: client_id,
        contrats: clientResult.contrats,
        apprenants: clientResult.apprenants,
        formations: clientResult.formations,
        companies: clientResult.companies,
        progressions: clientResult.progressions,
        invoice_steps: clientResult.invoice_steps,
        invoice_forecast_steps: clientResult.invoice_forecast_steps,
      });
    } catch (err) {
      syncResult.skippedClients++;
      const message = err instanceof Error ? err.message : String(err);
      syncResult.errors.push(`Client ${client_id}: ${message}`);
      logger.error('eduvia_sync', err, { clientId: client_id });
    }
  }

  logger.info('eduvia_sync', 'Synchronisation Eduvia terminée', {
    totalClients: syncResult.totalClients,
    syncedClients: syncResult.syncedClients,
    skippedClients: syncResult.skippedClients,
  });

  return syncResult;
}
