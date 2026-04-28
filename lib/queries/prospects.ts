import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';
import type { StageProspect } from '@/lib/utils/constants';
import type { Database } from '@/types/database';

type ProspectRow = Database['public']['Tables']['prospects']['Row'];

export type ProspectWithCommercial = ProspectRow & {
  commercial: {
    id: string;
    nom: string;
    prenom: string;
  } | null;
};

export interface ProspectFilters {
  commercialId?: string | 'unassigned' | 'me';
  region?: string;
  volumeMin?: number;
  typeProspect?: 'cfa' | 'entreprise';
  search?: string;
}

async function getCallerId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function getProspectsGroupedByStage(
  filters?: ProspectFilters,
): Promise<Record<StageProspect, ProspectWithCommercial[]>> {
  const supabase = await createClient();
  let query = supabase
    .from('prospects')
    .select('*, commercial:users!prospects_commercial_id_fkey(id, nom, prenom)')
    .eq('archive', false)
    .order('volume_apprenants', { ascending: false, nullsFirst: false });

  if (filters?.typeProspect) {
    query = query.eq('type_prospect', filters.typeProspect);
  }
  if (filters?.region) {
    query = query.eq('region', filters.region);
  }
  if (filters?.volumeMin !== undefined) {
    query = query.gte('volume_apprenants', filters.volumeMin);
  }
  if (filters?.commercialId === 'unassigned') {
    query = query.is('commercial_id', null);
  } else if (filters?.commercialId === 'me') {
    const callerId = await getCallerId();
    if (callerId) query = query.eq('commercial_id', callerId);
  } else if (filters?.commercialId) {
    query = query.eq('commercial_id', filters.commercialId);
  }
  if (filters?.search?.trim()) {
    query = query.ilike('nom', `%${filters.search.trim()}%`);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('queries.prospects', 'getProspectsGroupedByStage failed', {
      error,
    });
    throw new AppError(
      'PROSPECTS_FETCH_FAILED',
      'Impossible de charger les prospects',
      { cause: error },
    );
  }

  const grouped: Record<StageProspect, ProspectWithCommercial[]> = {
    non_contacte: [],
    r1: [],
    r2: [],
    signe: [],
  };

  for (const prospect of data ?? []) {
    grouped[prospect.stage].push(prospect as ProspectWithCommercial);
  }

  return grouped;
}

export async function getProspectById(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('prospects')
    .select(
      '*, commercial:users!prospects_commercial_id_fkey(id, nom, prenom), client:clients(id, raison_sociale, trigramme)',
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    logger.error('queries.prospects', 'getProspectById failed', { id, error });
    throw new AppError(
      'PROSPECTS_FETCH_FAILED',
      'Impossible de charger le prospect',
      { cause: error },
    );
  }

  return data;
}

export async function getProspectNotes(prospectId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('prospect_notes')
    .select('*, user:users!prospect_notes_user_id_fkey(id, nom, prenom, role)')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('queries.prospects', 'getProspectNotes failed', {
      prospectId,
      error,
    });
    throw new AppError(
      'PROSPECTS_FETCH_FAILED',
      'Impossible de charger les notes',
      { cause: error },
    );
  }

  return data;
}

export type ProspectNote = Awaited<ReturnType<typeof getProspectNotes>>[number];

export async function getProspectRegions(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('prospects')
    .select('region')
    .not('region', 'is', null)
    .eq('archive', false);

  if (error) return [];
  const set = new Set<string>();
  for (const row of data ?? []) {
    if (row.region) set.add(row.region);
  }
  return Array.from(set).sort();
}

export async function getCommerciaux() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, nom, prenom, role')
    .in('role', ['commercial', 'admin', 'superadmin'])
    .order('prenom');

  if (error) return [];
  return data ?? [];
}

export interface StageMedian {
  fromStage: StageProspect;
  medianDays: number;
  sampleSize: number;
}

export async function getProspectTimeInStageMedian(): Promise<StageMedian[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    // RPC not yet typed in Database; cast and validate at runtime
    'get_prospect_time_in_stage_median' as never,
  );
  if (error) {
    logger.error('queries.prospects', 'time-in-stage RPC failed', { error });
    return [];
  }
  const rows =
    (data as
      | {
          from_stage: StageProspect;
          median_days: number;
          sample_size: number;
        }[]
      | null) ?? [];
  return rows.map((r) => ({
    fromStage: r.from_stage,
    medianDays: Number(r.median_days),
    sampleSize: Number(r.sample_size),
  }));
}

export async function getProspectActiveStageEntry(
  prospectId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('prospect_stage_history' as never)
    .select('changed_at')
    .eq('prospect_id', prospectId)
    .order('changed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { changed_at: string } | null)?.changed_at ?? null;
}
