import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { groupContratsByType } from '@/lib/utils/kpi-computations';
import { format } from 'date-fns';
import { ACTIVE_STATES_ARRAY } from './shared';

export async function getDashboardData() {
  const supabase = await createClient();

  // 30 days ago for stale contrats detection
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = format(thirtyDaysAgo, 'yyyy-MM-dd');

  const [projetsRes, facturesRes, echeancesRes, contratsRes, staleContratsRes] =
    await Promise.all([
      supabase
        .from('projets')
        .select(
          'id, client:clients!projets_client_id_fkey!inner(is_demo, archive)',
        )
        .eq('statut', 'actif')
        .eq('archive', false)
        .eq('client.is_demo', false)
        .eq('client.archive', false),
      supabase
        .from('factures')
        .select(
          'id, statut, projet:projets!factures_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
        )
        .eq('projet.client.is_demo', false)
        .eq('projet.client.archive', false),
      supabase
        .from('echeances')
        .select(
          'id, projet:projets!echeances_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
        )
        .is('facture_id', null)
        .eq('validee', false)
        .eq('projet.client.is_demo', false)
        .eq('projet.client.archive', false),
      supabase
        .from('contrats')
        .select(
          'id, contract_type, projet:projets!contrats_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
        )
        .in('contract_state', ACTIVE_STATES_ARRAY)
        .eq('archive', false)
        .eq('projet.client.is_demo', false)
        .eq('projet.client.archive', false),
      // Contrats actifs depuis +30j candidats au "sans progression".
      // On joint contrats_progressions pour avoir last_activity_at (source
      // Eduvia) en plus du fallback saisies_temps.
      supabase
        .from('contrats')
        .select(
          'id, projet_id, contrats_progressions(last_activity_at), projet:projets!contrats_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
        )
        .eq('archive', false)
        .in('contract_state', ACTIVE_STATES_ARRAY)
        .lt('date_debut', thirtyDaysAgoStr)
        .eq('projet.client.is_demo', false)
        .eq('projet.client.archive', false),
    ]);

  // Log any individual query errors but don't throw - dashboard is best-effort
  if (projetsRes.error)
    logger.error('queries.dashboard', 'getDashboardData failed (projets)', {
      error: projetsRes.error,
    });
  if (facturesRes.error)
    logger.error('queries.dashboard', 'getDashboardData failed (factures)', {
      error: facturesRes.error,
    });
  if (echeancesRes.error)
    logger.error('queries.dashboard', 'getDashboardData failed (echeances)', {
      error: echeancesRes.error,
    });
  if (contratsRes.error)
    logger.error('queries.dashboard', 'getDashboardData failed (contrats)', {
      error: contratsRes.error,
    });
  if (staleContratsRes.error)
    logger.error(
      'queries.dashboard',
      'getDashboardData failed (staleContrats)',
      { error: staleContratsRes.error },
    );

  // "Sans progression" = contrats actifs depuis +30j sans activite recente.
  // Source primaire : contrats_progressions.last_activity_at (Eduvia).
  // Fallback : saisies_temps au niveau projet quand Eduvia n'a rien renvoye.
  const staleContrats = staleContratsRes.data ?? [];
  const thirtyDaysAgoTs = thirtyDaysAgo.getTime();
  const contratsWithNoEduviaActivity: Array<{
    id: string;
    projet_id: string;
  }> = [];
  for (const c of staleContrats) {
    const prog = Array.isArray(c.contrats_progressions)
      ? c.contrats_progressions[0]
      : c.contrats_progressions;
    const lastActivity = prog?.last_activity_at;
    if (lastActivity) {
      // Eduvia a une donnee : decision directe sur ce timestamp
      const t = new Date(lastActivity).getTime();
      if (t < thirtyDaysAgoTs) {
        contratsWithNoEduviaActivity.push({ id: c.id, projet_id: c.projet_id });
      }
    } else {
      // Pas de donnee Eduvia : fallback verification saisies_temps
      contratsWithNoEduviaActivity.push({ id: c.id, projet_id: c.projet_id });
    }
  }

  let contratsSansProgression = 0;
  if (contratsWithNoEduviaActivity.length > 0) {
    const projetIdsToCheck = [
      ...new Set(contratsWithNoEduviaActivity.map((c) => c.projet_id)),
    ];
    const { data: recentSaisies } = await supabase
      .from('saisies_temps')
      .select('projet_id')
      .in('projet_id', projetIdsToCheck)
      .gte('date', thirtyDaysAgoStr);

    const projetsWithSaisieRecente = new Set(
      (recentSaisies ?? []).map((s) => s.projet_id),
    );
    contratsSansProgression = contratsWithNoEduviaActivity.filter(
      (c) => !projetsWithSaisieRecente.has(c.projet_id),
    ).length;
  }

  const activeContratsList = contratsRes.data ?? [];
  return {
    projetsActifs: projetsRes.data?.length ?? 0,
    facturesEnRetard:
      facturesRes.data?.filter((f) => f.statut === 'en_retard').length ?? 0,
    facturesEmises:
      facturesRes.data?.filter((f) => f.statut === 'emise').length ?? 0,
    echeancesAFacturer: echeancesRes.data?.length ?? 0,
    contratsActifs: activeContratsList.length,
    contratsSansProgression,
    byType: groupContratsByType(activeContratsList),
  };
}

// ---------------------------------------------------------------------------
// Dashboard financial KPIs
// ---------------------------------------------------------------------------

export async function getUserWeekHours(): Promise<number> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  // Compute Monday of current week
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const mondayStr = format(monday, 'yyyy-MM-dd');

  // Friday of current week
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const fridayStr = format(friday, 'yyyy-MM-dd');

  const { data, error } = await supabase
    .from('saisies_temps')
    .select('heures')
    .eq('user_id', user.id)
    .gte('date', mondayStr)
    .lte('date', fridayStr);

  if (error) {
    logger.error('queries.dashboard', 'getUserWeekHours failed', { error });
    return 0;
  }

  return (data ?? []).reduce((sum, row) => sum + (row.heures ?? 0), 0);
}
