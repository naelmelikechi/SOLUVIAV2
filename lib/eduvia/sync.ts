import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { differenceInMonths } from 'date-fns';
import { fetchAllPages } from '@/lib/eduvia/client';
import type {
  EduviaContract,
  EduviaLearner,
  EduviaFormation,
  EduviaCompany,
} from '@/lib/eduvia/client';
import { decryptApiKey } from '@/lib/utils/encryption';
import { logger } from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncClientResult {
  clientId: string;
  contrats: number;
  apprenants: number;
  formations: number;
  companies: number;
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
// syncEduviaForClient — sync all data for a single client
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
    errors: [],
  };

  const now = new Date().toISOString();

  // ── Fetch projets for this client ──────────────────────────────────
  const { data: projets, error: projetsError } = await supabase
    .from('projets')
    .select('id, client_id')
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

  // Use the first projet as default target for contracts
  const defaultProjetId = projets[0]!.id;

  // ── Sync contracts ─────────────────────────────────────────────────
  try {
    const contracts = await fetchAllPages<EduviaContract>(
      instanceUrl,
      apiKey,
      'contracts',
    );

    for (const contract of contracts) {
      try {
        const duree_mois =
          contract.start_date && contract.end_date
            ? differenceInMonths(
                new Date(contract.end_date),
                new Date(contract.start_date),
              )
            : null;

        const { error: upsertError } = await supabase.from('contrats').upsert(
          {
            eduvia_id: contract.id,
            projet_id: defaultProjetId,
            apprenant_nom: contract.employee_learner?.last_name ?? null,
            apprenant_prenom: contract.employee_learner?.first_name ?? null,
            formation_titre: contract.formation?.title ?? null,
            date_debut: contract.start_date ?? null,
            date_fin: contract.end_date ?? null,
            contract_state: contract.state,
            montant_prise_en_charge: contract.funding_amount ?? null,
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
  } catch (err) {
    result.errors.push(
      `Erreur fetch contracts: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // ── Sync learners ──────────────────────────────────────────────────
  try {
    const learners = await fetchAllPages<EduviaLearner>(
      instanceUrl,
      apiKey,
      'employee_learners',
    );

    for (const learner of learners) {
      try {
        const { error: upsertError } = await supabase.from('apprenants').upsert(
          {
            eduvia_id: learner.id,
            nom: learner.last_name,
            prenom: learner.first_name,
            email: learner.email ?? null,
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
      } catch (err) {
        result.errors.push(
          `Apprenant eduvia_id=${learner.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } catch (err) {
    result.errors.push(
      `Erreur fetch learners: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // ── Sync formations ────────────────────────────────────────────────
  try {
    const formations = await fetchAllPages<EduviaFormation>(
      instanceUrl,
      apiKey,
      'formations',
    );

    for (const formation of formations) {
      try {
        const { error: upsertError } = await supabase.from('formations').upsert(
          {
            eduvia_id: formation.id,
            titre: formation.title,
            duree: formation.duration?.toString() ?? null,
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
      } catch (err) {
        result.errors.push(
          `Formation eduvia_id=${formation.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } catch (err) {
    result.errors.push(
      `Erreur fetch formations: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // ── Sync companies ─────────────────────────────────────────────────
  try {
    const companies = await fetchAllPages<EduviaCompany>(
      instanceUrl,
      apiKey,
      'companies',
    );

    for (const company of companies) {
      try {
        const { error: upsertError } = await supabase
          .from('eduvia_companies')
          .upsert(
            {
              eduvia_id: company.id,
              name: company.name,
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
      } catch (err) {
        result.errors.push(
          `Company eduvia_id=${company.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } catch (err) {
    result.errors.push(
      `Erreur fetch companies: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// syncAllEduviaClients — top-level orchestrator
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

  // Fetch all active API keys with their client info
  const { data: apiKeys, error: fetchError } = await supabase
    .from('client_api_keys')
    .select('id, client_id, api_key_encrypted, instance_url, label, is_active')
    .eq('is_active', true);

  if (fetchError) {
    syncResult.errors.push(
      `Erreur récupération des clés API: ${fetchError.message}`,
    );
    logger.error('eduvia_sync', fetchError, {
      step: 'fetch_api_keys',
    });
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

    const instanceUrl = instance_url;

    try {
      // Decrypt the API key
      const apiKey = decryptApiKey(api_key_encrypted);

      // Run sync for this client
      const clientResult = await syncEduviaForClient(
        supabase,
        client_id,
        instanceUrl,
        apiKey,
      );

      syncResult.results.push(clientResult);

      if (clientResult.errors.length > 0) {
        logger.warn('eduvia_sync', `Sync partielle pour client ${client_id}`, {
          clientId: client_id,
          errors: clientResult.errors,
          contrats: clientResult.contrats,
          apprenants: clientResult.apprenants,
        });
      }

      // Update last_sync_at on the API key record
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
