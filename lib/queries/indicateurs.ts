import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
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

function isoDateTimeStart(d: Date): string {
  return `${format(d, 'yyyy-MM-dd')}T00:00:00.000Z`;
}

function isoDateTimeEnd(d: Date): string {
  return `${format(d, 'yyyy-MM-dd')}T23:59:59.999Z`;
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
): Promise<WeeklyAggregates> {
  const startDate = isoDate(start);
  const endDate = isoDate(end);
  const startTs = isoDateTimeStart(start);
  const endTs = isoDateTimeEnd(end);

  const [
    rdvFormateursRes,
    rdvCommerciauxRes,
    contratsRes,
    tachesRes,
    ideesRes,
    progressionRes,
  ] = await Promise.all([
    supabase
      .from('rdv_formateurs')
      .select('id', { count: 'exact', head: true })
      .eq('statut', 'realise')
      .gte('date_realisee', startDate)
      .lte('date_realisee', endDate),
    supabase
      .from('rdv_commerciaux')
      .select('id', { count: 'exact', head: true })
      .eq('statut', 'realise')
      .gte('date_realisee', startDate)
      .lte('date_realisee', endDate),
    supabase
      .from('contrats')
      .select(
        'id, created_at, projet:projets!contrats_projet_id_fkey(client:clients!projets_client_id_fkey(apporteur_commercial_id))',
      )
      .gte('created_at', startTs)
      .lte('created_at', endTs),
    supabase
      .from('taches_qualite')
      .select('id', { count: 'exact', head: true })
      .gte('date_realisation', startTs)
      .lte('date_realisation', endTs),
    supabase
      .from('idees')
      .select('id', { count: 'exact', head: true })
      .eq('statut', 'implementee')
      .gte('implementee_at', startTs)
      .lte('implementee_at', endTs),
    supabase
      .from('progression_snapshots_weekly')
      .select('progression_percentage')
      .eq('semaine_debut', startDate),
  ]);

  if (rdvFormateursRes.error)
    logger.error('queries.indicateurs', 'computeWeek failed (rdv_formateurs)', {
      error: rdvFormateursRes.error,
      startDate,
      endDate,
    });
  if (rdvCommerciauxRes.error)
    logger.error(
      'queries.indicateurs',
      'computeWeek failed (rdv_commerciaux)',
      { error: rdvCommerciauxRes.error },
    );
  if (contratsRes.error)
    logger.error('queries.indicateurs', 'computeWeek failed (contrats)', {
      error: contratsRes.error,
    });
  if (tachesRes.error)
    logger.error('queries.indicateurs', 'computeWeek failed (taches_qualite)', {
      error: tachesRes.error,
    });
  if (ideesRes.error)
    logger.error('queries.indicateurs', 'computeWeek failed (idees)', {
      error: ideesRes.error,
    });
  if (progressionRes.error)
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
  const contratsRaw = (contratsRes.data ??
    []) as unknown as ContratWithClient[];
  const apprenantsApportes = contratsRaw.filter(
    (c) => c.projet?.client?.apporteur_commercial_id != null,
  ).length;

  const progressionRows = (progressionRes.data ?? []) as {
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
    rdvFormateurs: rdvFormateursRes.count ?? 0,
    rdvCommerciaux: rdvCommerciauxRes.count ?? 0,
    apprenantsApportes,
    tachesQualite: tachesRes.count ?? 0,
    ideesImplementees: ideesRes.count ?? 0,
    progressionMoyenne,
  };
}

export interface IndicateursData {
  kpis: KpiRow[];
  trend: TrendPoint[];
}

export async function getIndicateursData(): Promise<IndicateursData> {
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
      weeks.map((w) => computeWeek(supabase, w.start, w.end)),
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
    const previousAgg = await computeWeek(supabase, previousStart, previousEnd);
    void currentStart;
    void currentEnd;

    const kpis: KpiRow[] = [
      {
        key: 'rdvFormateurs',
        label: 'RDV formateurs réalisés',
        current: currentAgg.rdvFormateurs,
        previous: previousAgg.rdvFormateurs,
        format: 'number',
      },
      {
        key: 'rdvCommerciaux',
        label: 'RDV commerciaux réalisés',
        current: currentAgg.rdvCommerciaux,
        previous: previousAgg.rdvCommerciaux,
        format: 'number',
      },
      {
        key: 'apprenantsApportes',
        label: 'Apprenants apportés',
        current: currentAgg.apprenantsApportes,
        previous: previousAgg.apprenantsApportes,
        format: 'number',
      },
      {
        key: 'tachesQualite',
        label: 'Tâches qualité réalisées',
        current: currentAgg.tachesQualite,
        previous: previousAgg.tachesQualite,
        format: 'number',
      },
      {
        key: 'ideesImplementees',
        label: 'Idées implémentées',
        current: currentAgg.ideesImplementees,
        previous: previousAgg.ideesImplementees,
        format: 'number',
      },
      {
        key: 'progressionMoyenne',
        label: 'Progression moyenne',
        current: currentAgg.progressionMoyenne,
        previous: previousAgg.progressionMoyenne,
        format: 'percent',
      },
    ];

    return { kpis, trend };
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
    return {
      kpis: [
        {
          key: 'rdvFormateurs',
          label: 'RDV formateurs réalisés',
          current: 0,
          previous: 0,
          format: 'number',
        },
        {
          key: 'rdvCommerciaux',
          label: 'RDV commerciaux réalisés',
          current: 0,
          previous: 0,
          format: 'number',
        },
        {
          key: 'apprenantsApportes',
          label: 'Apprenants apportés',
          current: 0,
          previous: 0,
          format: 'number',
        },
        {
          key: 'tachesQualite',
          label: 'Tâches qualité réalisées',
          current: 0,
          previous: 0,
          format: 'number',
        },
        {
          key: 'ideesImplementees',
          label: 'Idées implémentées',
          current: 0,
          previous: 0,
          format: 'number',
        },
        {
          key: 'progressionMoyenne',
          label: 'Progression moyenne',
          current: 0,
          previous: 0,
          format: 'percent',
        },
      ],
      trend: emptyTrend,
    };
  }
}
