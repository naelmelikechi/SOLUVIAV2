import { createClient } from '@/lib/supabase/server';

export type Scope = 'global' | 'projet' | 'cdp';

export interface SparklineParams {
  kpiType: string;
  scope: Scope;
  scopeId?: string | null;
  monthsBack?: number; // default 12
}

export interface SparklinePoint {
  mois: string; // 'YYYY-MM-DD'
  valeur: number;
}

export async function getSparklineData(
  params: SparklineParams,
): Promise<SparklinePoint[]> {
  const supabase = await createClient();
  const monthsBack = params.monthsBack ?? 12;

  let query = supabase
    .from('kpi_snapshots')
    .select('mois, valeur')
    .eq('type_kpi', params.kpiType)
    .eq('scope', params.scope);

  if (params.scopeId) {
    query = query.eq('scope_id', params.scopeId);
  } else {
    query = query.is('scope_id', null);
  }

  const { data, error } = await query
    .order('mois', { ascending: false })
    .limit(monthsBack);

  if (error || !data) return [];

  return data
    .map((d) => ({ mois: d.mois as string, valeur: Number(d.valeur) }))
    .reverse();
}

export async function getLatestKpiValue(
  params: Omit<SparklineParams, 'monthsBack'>,
): Promise<number | null> {
  const data = await getSparklineData({ ...params, monthsBack: 1 });
  const last = data[data.length - 1];
  return last !== undefined ? last.valeur : null;
}
