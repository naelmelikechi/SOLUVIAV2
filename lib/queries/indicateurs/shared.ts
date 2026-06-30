// lib/queries/indicateurs/shared.ts
// Shared types, interfaces, and utility functions used across indicator domains.
import { createClient } from '@/lib/supabase/server';
import { isAdmin, canAccessPipeline } from '@/lib/utils/roles';
import { logger } from '@/lib/utils/logger';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  addWeeks,
  format,
  getISOWeek,
} from 'date-fns';

export type IndicateursScope =
  | { kind: 'admin' }
  | { kind: 'cdp'; userId: string }
  | { kind: 'commercial'; userId: string };

export type Period = 'week' | 'month';
export type TechPeriod = 'cycle' | 'month';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface CdpRatio {
  realise: number;
  total: number;
}

export interface CdpRowData {
  clientId: string;
  clientNom: string;
  progression: CdpRatio;
  rdvFormateurs: CdpRatio;
  qualite: CdpRatio;
  facturation: CdpRatio;
  facturesEnRetard: number;
}

export interface CommercialCounters {
  rdvRealises: number;
  contratsSignes: number;
  apprenantsApportes: number;
  volumeAlternants: number;
}

export interface TechCounters {
  ideesProposees: number;
  ideesImplementees: number;
}

export function isoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function isoTimestamp(d: Date): string {
  return d.toISOString();
}

export function getPeriodRange(
  period: Period,
  reference: Date = new Date(),
): DateRange {
  if (period === 'week') {
    return {
      start: startOfWeek(reference, { weekStartsOn: 1 }),
      end: endOfWeek(reference, { weekStartsOn: 1 }),
    };
  }
  return {
    start: startOfMonth(reference),
    end: reference,
  };
}

export function getTechRange(
  period: TechPeriod,
  reference: Date = new Date(),
): DateRange {
  if (period === 'month') {
    return {
      start: startOfMonth(reference),
      end: reference,
    };
  }
  const weekStart = startOfWeek(reference, { weekStartsOn: 1 });
  const isoWeek = getISOWeek(reference);
  const cycleStart =
    isoWeek % 2 === 0
      ? weekStart
      : startOfWeek(addWeeks(reference, -1), { weekStartsOn: 1 });
  const cycleEnd = endOfWeek(addWeeks(cycleStart, 1), { weekStartsOn: 1 });
  return { start: cycleStart, end: cycleEnd };
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

export async function fetchProjetsScope(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: IndicateursScope,
): Promise<{
  projetToClient: Map<string, string>;
  clients: Map<string, string>;
}> {
  let query = supabase
    .from('projets')
    .select(
      'id, client_id, cdp_id, backup_cdp_id, client:clients!projets_client_id_fkey(id, raison_sociale)',
    )
    .eq('archive', false)
    .eq('est_libre', false);

  if (scope.kind === 'cdp') {
    query = query.or(
      `cdp_id.eq.${scope.userId},backup_cdp_id.eq.${scope.userId}`,
    );
  }

  const { data, error } = await query;
  if (error) {
    logger.error('queries.indicateurs', 'fetchProjetsScope failed', { error });
    return { projetToClient: new Map(), clients: new Map() };
  }

  type Row = {
    id: string;
    client_id: string;
    client: { id: string; raison_sociale: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const projetToClient = new Map<string, string>();
  const clients = new Map<string, string>();
  for (const r of rows) {
    projetToClient.set(r.id, r.client_id);
    if (r.client) {
      clients.set(r.client.id, r.client.raison_sociale);
    }
  }
  return { projetToClient, clients };
}
