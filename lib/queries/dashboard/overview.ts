import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/supabase/fetch-all';
import { logger } from '@/lib/utils/logger';
import { groupContratsByType } from '@/lib/utils/kpi-computations';
import { soldeNetHt } from '@/lib/utils/avoir-netting';
import { format } from 'date-fns';
import { ACTIVE_STATES_ARRAY } from './shared';

export async function getDashboardData() {
  const supabase = await createClient();

  // 30 days ago for stale contrats detection
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = format(thirtyDaysAgo, 'yyyy-MM-dd');

  const [
    projetsRes,
    facturesRetardRes,
    facturesEmisesRes,
    echeancesRes,
    contratsRes,
    staleContratsRes,
  ] = await Promise.all([
    supabase
      .from('projets')
      .select(
        'id, client:clients!projets_client_id_fkey!inner(is_demo, archive)',
      )
      .eq('statut', 'actif')
      .eq('archive', false)
      .eq('client.is_demo', false)
      .eq('client.archive', false)
      .eq('est_libre', false),
    // Lignes legeres (montant + avoirs lies) plutot que head-count : les
    // compteurs ne doivent inclure que les factures avec un solde encore du
    // apres avoirs emis (facture soldee par avoir = ni en retard ni en attente).
    // fetchAllRows + .order('id') : PostgREST tronque a max_rows (1000).
    fetchAllRows((from, to) =>
      supabase
        .from('factures')
        .select(
          'id, montant_ht, avoirs:factures!factures_facture_origine_id_fkey(montant_ht, statut), projet:projets!factures_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
        )
        .eq('statut', 'en_retard')
        .eq('projet.client.is_demo', false)
        .eq('projet.client.archive', false)
        .order('id')
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from('factures')
        .select(
          'id, montant_ht, avoirs:factures!factures_facture_origine_id_fkey(montant_ht, statut), projet:projets!factures_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
        )
        .eq('statut', 'emise')
        .eq('projet.client.is_demo', false)
        .eq('projet.client.archive', false)
        .order('id')
        .range(from, to),
    ),
    // Echeances "pretes" = deja arrivees a date (<= aujourd'hui), aligne sur
    // le montant "A facturer" du chip (financials.ts) : pas d'echeances futures.
    supabase
      .from('echeances')
      .select(
        'id, projet:projets!echeances_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
      )
      .is('facture_id', null)
      .eq('validee', false)
      .lte('date_emission_prevue', format(new Date(), 'yyyy-MM-dd'))
      .eq('projet.client.is_demo', false)
      .eq('projet.client.archive', false),
    // fetchAllRows : PostgREST plafonne a max_rows=1000, un select non borne
    // tronquerait silencieusement les compteurs au-dela.
    fetchAllRows((from, to) =>
      supabase
        .from('contrats')
        .select(
          'id, contract_type, projet:projets!contrats_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
        )
        .in('contract_state', ACTIVE_STATES_ARRAY)
        .eq('archive', false)
        .eq('projet.client.is_demo', false)
        .eq('projet.client.archive', false)
        .order('id')
        .range(from, to),
    ),
    // Contrats actifs depuis +30j candidats au "sans progression".
    // On joint contrats_progressions pour avoir last_activity_at (source
    // Eduvia) en plus du fallback saisies_temps.
    fetchAllRows((from, to) =>
      supabase
        .from('contrats')
        .select(
          'id, projet_id, contrats_progressions(last_activity_at), projet:projets!contrats_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
        )
        .eq('archive', false)
        .in('contract_state', ACTIVE_STATES_ARRAY)
        .lt('date_debut', thirtyDaysAgoStr)
        .eq('projet.client.is_demo', false)
        .eq('projet.client.archive', false)
        .order('id')
        .range(from, to),
    ),
  ]);

  // Log any individual query errors but don't throw - dashboard is best-effort
  if (projetsRes.error)
    logger.error('queries.dashboard', 'getDashboardData failed (projets)', {
      error: projetsRes.error,
    });
  if (facturesRetardRes.error)
    logger.error(
      'queries.dashboard',
      'getDashboardData failed (facturesRetard)',
      { error: facturesRetardRes.error },
    );
  if (facturesEmisesRes.error)
    logger.error(
      'queries.dashboard',
      'getDashboardData failed (facturesEmises)',
      { error: facturesEmisesRes.error },
    );
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

  // "Sans progression" = contrats actifs depuis +30j sans activite APPRENANT
  // recente (contrats_progressions.last_activity_at, source Eduvia). Pas de
  // repechage par les saisies_temps internes : que l'equipe travaille sur le
  // projet ne dit rien de l'activite de l'apprenant (decision 2026-07-15).
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

  const contratsSansProgression = contratsWithNoEduviaActivity.length;

  const activeContratsList = contratsRes.data ?? [];
  const countSoldeDu = (
    rows:
      | {
          montant_ht: number | null;
          avoirs: { montant_ht: number | null; statut: string }[];
        }[]
      | null,
  ) =>
    (rows ?? []).filter((f) => soldeNetHt(f.montant_ht, f.avoirs) > 0).length;

  return {
    projetsActifs: projetsRes.data?.length ?? 0,
    facturesEnRetard: countSoldeDu(facturesRetardRes.data),
    facturesEmises: countSoldeDu(facturesEmisesRes.data),
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
