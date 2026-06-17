import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';
import {
  STAGE_PROSPECT_ORDER,
  type StageProspect,
} from '@/lib/utils/constants';
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

  const grouped = {} as Record<StageProspect, ProspectWithCommercial[]>;
  for (const s of STAGE_PROSPECT_ORDER) grouped[s] = [];

  for (const prospect of data ?? []) {
    grouped[prospect.stage].push(prospect as ProspectWithCommercial);
  }

  return grouped;
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

// ---------------------------------------------------------------------------
// Liste plate (vue tableau Feature 1) — triée par fraîcheur d'activité
// ---------------------------------------------------------------------------

export type ProspectContactSummary = {
  id: string;
  nom: string;
  email: string | null;
  telephone: string | null;
};

export type ProspectListItem = ProspectWithCommercial & {
  contact_principal: ProspectContactSummary | null;
  prochaine_action_at: string | null;
};

export async function getProspectsList(
  filters?: ProspectFilters,
): Promise<ProspectListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from('prospects')
    .select(
      '*, commercial:users!prospects_commercial_id_fkey(id, nom, prenom), contact_principal:prospect_contacts!prospects_contact_principal_id_fkey(id, nom, email, telephone)',
    )
    .eq('archive', false)
    .order('derniere_action_at', { ascending: false });

  // Mêmes filtres que getProspectsGroupedByStage (cohérence pipeline).
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
    logger.error('queries.prospects', 'getProspectsList failed', { error });
    throw new AppError(
      'PROSPECTS_FETCH_FAILED',
      'Impossible de charger les prospects',
      { cause: error },
    );
  }

  const prospects = (data ?? []) as unknown as Array<
    ProspectWithCommercial & {
      contact_principal: ProspectContactSummary | null;
    }
  >;

  // Prochaine action = prochain RDV planifié (1 seule requête, pas de N+1).
  const nextByProspect = new Map<string, string>();
  if (prospects.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: rdvs } = await supabase
      .from('rdv_commerciaux')
      .select('prospect_id, date_prevue')
      .eq('statut', 'prevu')
      .gte('date_prevue', today)
      .order('date_prevue', { ascending: true });
    for (const r of rdvs ?? []) {
      if (!nextByProspect.has(r.prospect_id)) {
        nextByProspect.set(r.prospect_id, r.date_prevue);
      }
    }
  }

  return prospects.map((p) => ({
    ...p,
    prochaine_action_at: nextByProspect.get(p.id) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Interlocuteurs et journal (fiche prospect Feature 2)
// ---------------------------------------------------------------------------

export type ProspectContact =
  Database['public']['Tables']['prospect_contacts']['Row'];

export async function getProspectContacts(
  prospectId: string,
): Promise<ProspectContact[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('prospect_contacts')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('queries.prospects', 'getProspectContacts failed', {
      prospectId,
      error,
    });
    throw new AppError(
      'PROSPECTS_FETCH_FAILED',
      'Impossible de charger les interlocuteurs',
      { cause: error },
    );
  }
  return data ?? [];
}

export async function getProspectStageHistory(prospectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('prospect_stage_history')
    .select(
      '*, changed_by_user:users!prospect_stage_history_changed_by_fkey(id, nom, prenom)',
    )
    .eq('prospect_id', prospectId)
    .order('changed_at', { ascending: false });

  if (error) {
    logger.error('queries.prospects', 'getProspectStageHistory failed', {
      prospectId,
      error,
    });
    return [];
  }
  return data ?? [];
}

export type ProspectStageHistoryItem = Awaited<
  ReturnType<typeof getProspectStageHistory>
>[number];

// Doublon potentiel renvoyé par la RPC find_prospect_duplicates (Feature 2 §7).
export interface ProspectDuplicate {
  id: string;
  nom: string;
  siret: string | null;
  stage: StageProspect;
  similarite: number;
}

export async function getProspectCommunications(prospectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('prospect_communications')
    .select(
      '*, user:users!prospect_communications_user_id_fkey(id, nom, prenom)',
    )
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('queries.prospects', 'getProspectCommunications failed', {
      prospectId,
      error,
    });
    return [];
  }
  return data ?? [];
}

export type ProspectCommunication = Awaited<
  ReturnType<typeof getProspectCommunications>
>[number];

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
    return null;
  }
  return data;
}

export type ProspectDetail = NonNullable<
  Awaited<ReturnType<typeof getProspectById>>
>;
