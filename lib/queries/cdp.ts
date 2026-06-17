import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';
import { computeCdpScore, type CdpScore } from '@/lib/utils/cdp-scoring';
import type { DispoCdp } from '@/lib/utils/constants';

/**
 * Plan de charge — une ligne par CDP (users role='cdp' ou referent_cdp=true)
 * avec ses compteurs de charge réels et son score d'affectation.
 */
export interface CdpPlanLine {
  cdp: { id: string; nom: string; prenom: string };
  nbClients: number;
  nbProjetsActifs: number;
  nbAlternants: number;
  disponibilite: DispoCdp | null;
  score: CdpScore;
}

/**
 * Charge le plan de charge de tous les CDP en 4 requêtes (users + clients +
 * projets + contrats joints projets), puis agrège les compteurs en mémoire :
 * aucune requête par CDP (pas de N+1).
 */
export async function getCdpPlanDeCharge(): Promise<CdpPlanLine[]> {
  const supabase = await createClient();

  const { data: cdps, error: cdpsError } = await supabase
    .from('users')
    .select('id, nom, prenom, cdp_disponibilite')
    .or('role.eq.cdp,referent_cdp.eq.true')
    .order('nom');

  if (cdpsError) {
    logger.error('queries.cdp', 'getCdpPlanDeCharge users failed', {
      error: cdpsError,
    });
    throw new AppError('USERS_FETCH_FAILED', 'Impossible de charger les CDP', {
      cause: cdpsError,
    });
  }
  if (!cdps || cdps.length === 0) return [];

  const cdpIds = cdps.map((c) => c.id);

  const [clientsRes, projetsRes, contratsRes] = await Promise.all([
    supabase
      .from('clients')
      .select('cdp_referent_id')
      .eq('archive', false)
      .in('cdp_referent_id', cdpIds),
    supabase
      .from('projets')
      .select('cdp_id')
      .eq('statut', 'actif')
      .eq('archive', false)
      .eq('est_interne', false)
      .in('cdp_id', cdpIds),
    supabase
      .from('contrats')
      .select('projet:projets!contrats_projet_id_fkey!inner(cdp_id)')
      .eq('archive', false)
      .in('projet.cdp_id', cdpIds),
  ]);

  if (clientsRes.error) {
    logger.error('queries.cdp', 'getCdpPlanDeCharge clients failed', {
      error: clientsRes.error,
    });
    throw new AppError(
      'CLIENTS_FETCH_FAILED',
      'Impossible de charger les clients des CDP',
      { cause: clientsRes.error },
    );
  }
  if (projetsRes.error) {
    logger.error('queries.cdp', 'getCdpPlanDeCharge projets failed', {
      error: projetsRes.error,
    });
    throw new AppError(
      'PROJETS_FETCH_FAILED',
      'Impossible de charger les projets des CDP',
      { cause: projetsRes.error },
    );
  }
  if (contratsRes.error) {
    logger.error('queries.cdp', 'getCdpPlanDeCharge contrats failed', {
      error: contratsRes.error,
    });
    throw new AppError(
      'PROJETS_CONTRATS_FETCH_FAILED',
      'Impossible de charger les contrats des CDP',
      { cause: contratsRes.error },
    );
  }

  const nbClientsByCdp = new Map<string, number>();
  for (const row of clientsRes.data ?? []) {
    const id = row.cdp_referent_id;
    if (id) nbClientsByCdp.set(id, (nbClientsByCdp.get(id) ?? 0) + 1);
  }

  const nbProjetsByCdp = new Map<string, number>();
  for (const row of projetsRes.data ?? []) {
    const id = row.cdp_id;
    if (id) nbProjetsByCdp.set(id, (nbProjetsByCdp.get(id) ?? 0) + 1);
  }

  const nbAlternantsByCdp = new Map<string, number>();
  for (const row of contratsRes.data ?? []) {
    const projet = row.projet as { cdp_id: string | null } | null;
    const id = projet?.cdp_id;
    if (id) nbAlternantsByCdp.set(id, (nbAlternantsByCdp.get(id) ?? 0) + 1);
  }

  return cdps.map((cdp) => {
    const nbClients = nbClientsByCdp.get(cdp.id) ?? 0;
    const nbAlternants = nbAlternantsByCdp.get(cdp.id) ?? 0;
    const disponibilite = cdp.cdp_disponibilite;
    return {
      cdp: { id: cdp.id, nom: cdp.nom, prenom: cdp.prenom },
      nbClients,
      nbProjetsActifs: nbProjetsByCdp.get(cdp.id) ?? 0,
      nbAlternants,
      disponibilite,
      score: computeCdpScore({
        cdpId: cdp.id,
        nbClients,
        nbAlternants,
        disponibilite,
      }),
    };
  });
}

/** Client signé sans référent CDP, candidat à l'affectation. */
export interface ClientAAffecter {
  id: string;
  raison_sociale: string;
  trigramme: string;
  created_at: string;
}

/** Clients actifs sans référent CDP (cdp_referent_id IS NULL). */
export async function getClientsAAffecter(): Promise<ClientAAffecter[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('clients')
    .select('id, raison_sociale, trigramme, created_at')
    .eq('archive', false)
    .is('cdp_referent_id', null)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('queries.cdp', 'getClientsAAffecter failed', { error });
    throw new AppError(
      'CLIENTS_FETCH_FAILED',
      'Impossible de charger les clients à affecter',
      { cause: error },
    );
  }
  return data ?? [];
}

/** Client du portefeuille d'un CDP, avec son nombre de projets actifs. */
export interface CdpPipelineClient {
  id: string;
  raison_sociale: string;
  trigramme: string;
  cdp_affecte_at: string | null;
  nbProjetsActifs: number;
}

/**
 * Portefeuille d'un CDP : clients dont il est référent, enrichis du nombre de
 * projets actifs (1 requête clients + 1 requête projets, pas de N+1).
 */
export async function getCdpPipeline(
  cdpId: string,
): Promise<CdpPipelineClient[]> {
  const supabase = await createClient();

  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, raison_sociale, trigramme, cdp_affecte_at')
    .eq('cdp_referent_id', cdpId)
    .eq('archive', false)
    .order('cdp_affecte_at', { ascending: false });

  if (error) {
    logger.error('queries.cdp', 'getCdpPipeline clients failed', {
      cdpId,
      error,
    });
    throw new AppError(
      'CLIENTS_FETCH_FAILED',
      'Impossible de charger le portefeuille du CDP',
      { cause: error },
    );
  }
  if (!clients || clients.length === 0) return [];

  const clientIds = clients.map((c) => c.id);
  const { data: projets, error: projetsError } = await supabase
    .from('projets')
    .select('client_id')
    .in('client_id', clientIds)
    .eq('statut', 'actif')
    .eq('archive', false)
    .eq('est_interne', false);

  if (projetsError) {
    logger.error('queries.cdp', 'getCdpPipeline projets failed', {
      cdpId,
      error: projetsError,
    });
    throw new AppError(
      'PROJETS_FETCH_FAILED',
      'Impossible de charger les projets du portefeuille',
      { cause: projetsError },
    );
  }

  const nbProjetsByClient = new Map<string, number>();
  for (const row of projets ?? []) {
    const id = row.client_id;
    nbProjetsByClient.set(id, (nbProjetsByClient.get(id) ?? 0) + 1);
  }

  return clients.map((c) => ({
    id: c.id,
    raison_sociale: c.raison_sociale,
    trigramme: c.trigramme,
    cdp_affecte_at: c.cdp_affecte_at,
    nbProjetsActifs: nbProjetsByClient.get(c.id) ?? 0,
  }));
}

/** CDP actifs sélectionnables pour une affectation (avec leur disponibilité). */
export async function getCdpCandidates(): Promise<
  { id: string; nom: string; prenom: string; disponibilite: DispoCdp | null }[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('users')
    .select('id, nom, prenom, cdp_disponibilite')
    .or('role.eq.cdp,referent_cdp.eq.true')
    .eq('actif', true)
    .order('nom');

  if (error) {
    logger.error('queries.cdp', 'getCdpCandidates failed', { error });
    throw new AppError(
      'USERS_FETCH_FAILED',
      'Impossible de charger les CDP candidats',
      { cause: error },
    );
  }

  return (data ?? []).map((u) => ({
    id: u.id,
    nom: u.nom,
    prenom: u.prenom,
    disponibilite: u.cdp_disponibilite,
  }));
}
