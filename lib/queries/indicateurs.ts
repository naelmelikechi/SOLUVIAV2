import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { isAdmin, canAccessPipeline } from '@/lib/utils/roles';
import { startOfWeek, endOfWeek, addWeeks, format } from 'date-fns';

export type KpiFormat = 'number' | 'percent';

export interface KpiRow {
  key: KpiKey;
  label: string;
  current: number;
  previous: number;
  format?: KpiFormat;
}

export type KpiKey =
  | 'rdvFormateurs'
  | 'rdvCommerciaux'
  | 'apprenantsApportes'
  | 'tachesQualite'
  | 'ideesImplementees'
  | 'progressionMoyenne';

export interface TrendPoint {
  semaine: string;
  rdvFormateurs: number;
  rdvCommerciaux: number;
  apprenantsApportes: number;
  tachesQualite: number;
  ideesImplementees: number;
  progressionMoyenne: number;
}

export interface WeekRange {
  currentStart: Date;
  currentEnd: Date;
  previousStart: Date;
  previousEnd: Date;
}

export type IndicateursScope =
  | { kind: 'admin' }
  | { kind: 'cdp'; userId: string }
  | { kind: 'commercial'; userId: string };

export function getWeekRange(reference: Date = new Date()): WeekRange {
  const currentStart = startOfWeek(reference, { weekStartsOn: 1 });
  const currentEnd = endOfWeek(reference, { weekStartsOn: 1 });
  const previousStart = startOfWeek(addWeeks(reference, -1), {
    weekStartsOn: 1,
  });
  const previousEnd = endOfWeek(addWeeks(reference, -1), { weekStartsOn: 1 });
  return { currentStart, currentEnd, previousStart, previousEnd };
}

function isoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function isoTimestamp(d: Date): string {
  return d.toISOString();
}

interface WeeklyAggregates {
  rdvFormateurs: number;
  rdvCommerciaux: number;
  apprenantsApportes: number;
  tachesQualite: number;
  ideesImplementees: number;
  progressionMoyenne: number;
}

async function computeWeek(
  supabase: Awaited<ReturnType<typeof createClient>>,
  start: Date,
  end: Date,
  scope: IndicateursScope,
): Promise<WeeklyAggregates> {
  const startDate = isoDate(start);
  const endDate = isoDate(end);
  const startTs = isoTimestamp(start);
  const endTs = isoTimestamp(end);

  const needsRdvFormateurs = scope.kind === 'admin' || scope.kind === 'cdp';
  const needsRdvCommerciaux =
    scope.kind === 'admin' || scope.kind === 'commercial';
  const needsApprenants = scope.kind === 'admin' || scope.kind === 'commercial';
  const needsTachesQualite = scope.kind === 'admin' || scope.kind === 'cdp';
  const needsProgression = scope.kind === 'admin' || scope.kind === 'cdp';
  const needsIdees = true;

  let rdvFormateursQuery = supabase
    .from('rdv_formateurs')
    .select('id', { count: 'exact', head: true })
    .eq('statut', 'realise')
    .gte('date_realisee', startDate)
    .lte('date_realisee', endDate);
  if (scope.kind === 'cdp') {
    rdvFormateursQuery = rdvFormateursQuery.eq('cdp_id', scope.userId);
  }

  let rdvCommerciauxQuery = supabase
    .from('rdv_commerciaux')
    .select('id', { count: 'exact', head: true })
    .eq('statut', 'realise')
    .gte('date_realisee', startDate)
    .lte('date_realisee', endDate);
  if (scope.kind === 'commercial') {
    rdvCommerciauxQuery = rdvCommerciauxQuery.eq('commercial_id', scope.userId);
  }

  const contratsQuery = supabase
    .from('contrats')
    .select(
      'id, created_at, projet:projets!contrats_projet_id_fkey(client:clients!projets_client_id_fkey(apporteur_commercial_id))',
    )
    .gte('created_at', startTs)
    .lte('created_at', endTs);

  const [
    rdvFormateursRes,
    rdvCommerciauxRes,
    contratsRes,
    tachesRes,
    ideesRes,
    progressionRes,
  ] = await Promise.all([
    needsRdvFormateurs ? rdvFormateursQuery : Promise.resolve(null),
    needsRdvCommerciaux ? rdvCommerciauxQuery : Promise.resolve(null),
    needsApprenants ? contratsQuery : Promise.resolve(null),
    needsTachesQualite
      ? supabase
          .from('taches_qualite')
          .select('id', { count: 'exact', head: true })
          .gte('date_realisation', startTs)
          .lte('date_realisation', endTs)
      : Promise.resolve(null),
    needsIdees
      ? supabase
          .from('idees')
          .select('id', { count: 'exact', head: true })
          .eq('statut', 'implementee')
          .gte('implementee_at', startTs)
          .lte('implementee_at', endTs)
      : Promise.resolve(null),
    needsProgression
      ? supabase
          .from('progression_snapshots_weekly')
          .select('progression_percentage')
          .eq('semaine_debut', startDate)
      : Promise.resolve(null),
  ]);

  if (rdvFormateursRes?.error)
    logger.error('queries.indicateurs', 'computeWeek failed (rdv_formateurs)', {
      error: rdvFormateursRes.error,
      startDate,
      endDate,
    });
  if (rdvCommerciauxRes?.error)
    logger.error(
      'queries.indicateurs',
      'computeWeek failed (rdv_commerciaux)',
      { error: rdvCommerciauxRes.error },
    );
  if (contratsRes?.error)
    logger.error('queries.indicateurs', 'computeWeek failed (contrats)', {
      error: contratsRes.error,
    });
  if (tachesRes?.error)
    logger.error('queries.indicateurs', 'computeWeek failed (taches_qualite)', {
      error: tachesRes.error,
    });
  if (ideesRes?.error)
    logger.error('queries.indicateurs', 'computeWeek failed (idees)', {
      error: ideesRes.error,
    });
  if (progressionRes?.error)
    logger.error(
      'queries.indicateurs',
      'computeWeek failed (progression_snapshots)',
      { error: progressionRes.error },
    );

  type ContratWithClient = {
    id: string;
    projet: {
      client: { apporteur_commercial_id: string | null } | null;
    } | null;
  };
  const contratsRaw = (contratsRes?.data ??
    []) as unknown as ContratWithClient[];
  const apprenantsApportesAll = contratsRaw.filter(
    (c) => c.projet?.client?.apporteur_commercial_id != null,
  );
  const apprenantsApportes =
    scope.kind === 'commercial'
      ? apprenantsApportesAll.filter(
          (c) => c.projet?.client?.apporteur_commercial_id === scope.userId,
        ).length
      : apprenantsApportesAll.length;

  const progressionRows = (progressionRes?.data ?? []) as {
    progression_percentage: number | string | null;
  }[];
  const progressionValues = progressionRows
    .map((r) => Number(r.progression_percentage ?? 0))
    .filter((n) => !Number.isNaN(n));
  const progressionMoyenne =
    progressionValues.length > 0
      ? Math.round(
          (progressionValues.reduce((a, b) => a + b, 0) /
            progressionValues.length) *
            10,
        ) / 10
      : 0;

  return {
    rdvFormateurs: rdvFormateursRes?.count ?? 0,
    rdvCommerciaux: rdvCommerciauxRes?.count ?? 0,
    apprenantsApportes,
    tachesQualite: tachesRes?.count ?? 0,
    ideesImplementees: ideesRes?.count ?? 0,
    progressionMoyenne,
  };
}

export interface IndicateursData {
  kpis: KpiRow[];
  trend: TrendPoint[];
  scope: IndicateursScope;
}

const ALL_KPI_DEFS: Record<KpiKey, { label: string; format: KpiFormat }> = {
  rdvFormateurs: { label: 'RDV formateurs réalisés', format: 'number' },
  rdvCommerciaux: { label: 'RDV commerciaux réalisés', format: 'number' },
  apprenantsApportes: { label: 'Apprenants apportés', format: 'number' },
  tachesQualite: { label: 'Tâches qualité réalisées', format: 'number' },
  ideesImplementees: { label: 'Idées implémentées', format: 'number' },
  progressionMoyenne: { label: 'Progression moyenne', format: 'percent' },
};

const KPI_ORDER: KpiKey[] = [
  'rdvFormateurs',
  'rdvCommerciaux',
  'apprenantsApportes',
  'tachesQualite',
  'ideesImplementees',
  'progressionMoyenne',
];

export function getKpiKeysForScope(scope: IndicateursScope): KpiKey[] {
  switch (scope.kind) {
    case 'admin':
      return KPI_ORDER;
    case 'cdp':
      return [
        'rdvFormateurs',
        'tachesQualite',
        'progressionMoyenne',
        'ideesImplementees',
      ];
    case 'commercial':
      return ['rdvCommerciaux', 'apprenantsApportes', 'ideesImplementees'];
  }
}

function buildKpiRow(
  key: KpiKey,
  current: WeeklyAggregates,
  previous: WeeklyAggregates,
): KpiRow {
  const def = ALL_KPI_DEFS[key];
  return {
    key,
    label: def.label,
    current: current[key],
    previous: previous[key],
    format: def.format,
  };
}

export async function getIndicateursScope(): Promise<IndicateursScope | null> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data: userRow } = await supabase
    .from('users')
    .select('role, pipeline_access')
    .eq('id', authUser.id)
    .single();

  if (!userRow) return null;

  if (isAdmin(userRow.role)) {
    return { kind: 'admin' };
  }
  if (userRow.role === 'cdp') {
    return { kind: 'cdp', userId: authUser.id };
  }
  if (canAccessPipeline(userRow.role, userRow.pipeline_access)) {
    return { kind: 'commercial', userId: authUser.id };
  }
  return null;
}

export async function getIndicateursData(
  scope: IndicateursScope,
): Promise<IndicateursData> {
  const allowedKeys = getKpiKeysForScope(scope);

  try {
    const supabase = await createClient();
    const now = new Date();
    const { currentStart, currentEnd, previousStart, previousEnd } =
      getWeekRange(now);

    const weeks: { start: Date; end: Date }[] = [];
    for (let offset = -7; offset <= 0; offset++) {
      const s = startOfWeek(addWeeks(now, offset), { weekStartsOn: 1 });
      const e = endOfWeek(addWeeks(now, offset), { weekStartsOn: 1 });
      weeks.push({ start: s, end: e });
    }

    const trendResults = await Promise.all(
      weeks.map((w) => computeWeek(supabase, w.start, w.end, scope)),
    );

    const trend: TrendPoint[] = trendResults.map((agg, i) => {
      const w = weeks[i]!;
      return {
        semaine: format(w.start, 'dd/MM'),
        ...agg,
      };
    });

    const currentAgg = trendResults[trendResults.length - 1] ?? {
      rdvFormateurs: 0,
      rdvCommerciaux: 0,
      apprenantsApportes: 0,
      tachesQualite: 0,
      ideesImplementees: 0,
      progressionMoyenne: 0,
    };
    const previousAgg = await computeWeek(
      supabase,
      previousStart,
      previousEnd,
      scope,
    );
    void currentStart;
    void currentEnd;

    const kpis: KpiRow[] = allowedKeys.map((key) =>
      buildKpiRow(key, currentAgg, previousAgg),
    );

    return { kpis, trend, scope };
  } catch (error) {
    logger.error('queries.indicateurs', 'getIndicateursData failed', { error });
    const emptyTrend: TrendPoint[] = Array.from({ length: 8 }).map(() => ({
      semaine: '',
      rdvFormateurs: 0,
      rdvCommerciaux: 0,
      apprenantsApportes: 0,
      tachesQualite: 0,
      ideesImplementees: 0,
      progressionMoyenne: 0,
    }));
    const emptyAgg: WeeklyAggregates = {
      rdvFormateurs: 0,
      rdvCommerciaux: 0,
      apprenantsApportes: 0,
      tachesQualite: 0,
      ideesImplementees: 0,
      progressionMoyenne: 0,
    };
    return {
      kpis: allowedKeys.map((key) => buildKpiRow(key, emptyAgg, emptyAgg)),
      trend: emptyTrend,
      scope,
    };
  }
}
