// lib/queries/indicateurs/commercial.ts
// Indicateurs commerciaux : RDV, contrats signes, apprenants apportes, volume.
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { ACTIVE_CONTRACT_STATES } from '@/lib/utils/contrat-states';
import {
  type IndicateursScope,
  type CommercialCounters,
  isoDate,
  isoTimestamp,
  getPeriodRange,
} from './shared';

export async function getCommercialCounters(
  scope: IndicateursScope,
  reference: Date = new Date(),
): Promise<CommercialCounters> {
  try {
    const supabase = await createClient();
    const weekRange = getPeriodRange('week', reference);
    const monthRange = getPeriodRange('month', reference);
    const commercialId = scope.kind === 'commercial' ? scope.userId : null;

    let rdvQuery = supabase
      .from('rdv_commerciaux')
      .select('id', { count: 'exact', head: true })
      .eq('statut', 'realise')
      .gte('date_realisee', isoDate(weekRange.start))
      .lte('date_realisee', isoDate(weekRange.end));
    if (commercialId) rdvQuery = rdvQuery.eq('commercial_id', commercialId);

    const signesQuery = supabase
      .from('contrats')
      .select(
        'id, accepted_at, contract_state, archive, projet:projets!contrats_projet_id_fkey(client:clients!projets_client_id_fkey(apporteur_commercial_id))',
      )
      .eq('contract_state', 'signe')
      .gte('accepted_at', isoTimestamp(monthRange.start))
      .lte('accepted_at', isoTimestamp(monthRange.end));

    const apportesQuery = supabase
      .from('contrats')
      .select(
        'id, eduvia_employee_id, created_at, projet:projets!contrats_projet_id_fkey(client:clients!projets_client_id_fkey(apporteur_commercial_id))',
      )
      .gte('created_at', isoTimestamp(monthRange.start))
      .lte('created_at', isoTimestamp(monthRange.end));

    const volumeQuery = supabase
      .from('contrats')
      .select(
        'id, eduvia_employee_id, projet:projets!contrats_projet_id_fkey(client:clients!projets_client_id_fkey(apporteur_commercial_id))',
      )
      .eq('archive', false)
      .in('contract_state', Array.from(ACTIVE_CONTRACT_STATES));

    const [rdvRes, signesRes, apportesRes, volumeRes] = await Promise.all([
      rdvQuery,
      signesQuery,
      apportesQuery,
      volumeQuery,
    ]);

    if (rdvRes.error)
      logger.error('queries.indicateurs', 'commercial rdv failed', {
        error: rdvRes.error,
      });
    if (signesRes.error)
      logger.error('queries.indicateurs', 'commercial signes failed', {
        error: signesRes.error,
      });
    if (apportesRes.error)
      logger.error('queries.indicateurs', 'commercial apportes failed', {
        error: apportesRes.error,
      });
    if (volumeRes.error)
      logger.error('queries.indicateurs', 'commercial volume failed', {
        error: volumeRes.error,
      });

    type ContratWithClient = {
      id: string;
      eduvia_employee_id?: string | null;
      projet: {
        client: { apporteur_commercial_id: string | null } | null;
      } | null;
    };

    const filterByApporteur = (rows: ContratWithClient[]) => {
      if (!commercialId) return rows;
      return rows.filter(
        (c) => c.projet?.client?.apporteur_commercial_id === commercialId,
      );
    };

    // Apprenants distincts : un apprenant qui signe N contrats compte 1.
    // Tombe sur l'id du contrat quand eduvia_employee_id est null (pas tres
    // frequent, contrats hors-Eduvia).
    const distinctLearners = (rows: ContratWithClient[]) => {
      const keys = new Set<string>();
      for (const r of rows) keys.add(r.eduvia_employee_id ?? `c:${r.id}`);
      return keys.size;
    };

    const signes = filterByApporteur(
      (signesRes.data ?? []) as unknown as ContratWithClient[],
    );
    const apportes = filterByApporteur(
      (apportesRes.data ?? []) as unknown as ContratWithClient[],
    );
    const volume = filterByApporteur(
      (volumeRes.data ?? []) as unknown as ContratWithClient[],
    );

    return {
      rdvRealises: rdvRes.count ?? 0,
      contratsSignes: signes.length,
      apprenantsApportes: distinctLearners(apportes),
      volumeAlternants: distinctLearners(volume),
    };
  } catch (error) {
    logger.error('queries.indicateurs', 'getCommercialCounters failed', {
      error,
    });
    return {
      rdvRealises: 0,
      contratsSignes: 0,
      apprenantsApportes: 0,
      volumeAlternants: 0,
    };
  }
}
