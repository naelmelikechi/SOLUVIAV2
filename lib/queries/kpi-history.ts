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

/**
 * Version BATCH : charge les series de PLUSIEURS type_kpi pour un meme scope en
 * UNE requete (vs 1 par type). Retourne une Map type_kpi -> points (ordre
 * chronologique, derniers `monthsBack` mois). La derniere valeur d'une serie
 * equivaut a getLatestKpiValue.
 */
export async function getKpiSeriesBatch(params: {
  kpiTypes: string[];
  scope: Scope;
  scopeId?: string | null;
  monthsBack?: number;
}): Promise<Map<string, SparklinePoint[]>> {
  const result = new Map<string, SparklinePoint[]>();
  if (params.kpiTypes.length === 0) return result;
  for (const t of params.kpiTypes) result.set(t, []);

  const supabase = await createClient();
  const monthsBack = params.monthsBack ?? 12;

  let query = supabase
    .from('kpi_snapshots')
    .select('type_kpi, mois, valeur')
    .in('type_kpi', params.kpiTypes)
    .eq('scope', params.scope);
  if (params.scopeId) query = query.eq('scope_id', params.scopeId);
  else query = query.is('scope_id', null);

  const { data, error } = await query.order('mois', { ascending: true });
  if (error || !data) return result;

  for (const d of data) {
    const arr = result.get(d.type_kpi as string);
    if (arr) arr.push({ mois: d.mois as string, valeur: Number(d.valeur) });
  }
  // Cap aux `monthsBack` derniers mois par serie (deja en ordre croissant).
  for (const [t, pts] of result) {
    if (pts.length > monthsBack)
      result.set(t, pts.slice(pts.length - monthsBack));
  }
  return result;
}
