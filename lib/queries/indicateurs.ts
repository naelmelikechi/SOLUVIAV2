import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { isAdmin, canAccessPipeline } from '@/lib/utils/roles';
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

function isoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function isoTimestamp(d: Date): string {
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

export function getPreviousWeekRange(reference: Date = new Date()): DateRange {
  return {
    start: startOfWeek(addWeeks(reference, -1), { weekStartsOn: 1 }),
    end: endOfWeek(addWeeks(reference, -1), { weekStartsOn: 1 }),
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

async function fetchProjetsScope(
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
    .eq('est_absence', false);

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

interface SnapshotRow {
  contrat_id: string;
  semaine_debut: string;
  progression_percentage: number;
}

interface ContratProjetRow {
  id: string;
  projet_id: string;
}

async function computeProgressionRatios(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projetToClient: Map<string, string>,
  period: Period,
  reference: Date,
): Promise<Map<string, CdpRatio>> {
  const ratios = new Map<string, CdpRatio>();
  if (projetToClient.size === 0) return ratios;

  const projetIds = Array.from(projetToClient.keys());

  const { data: contratsData, error: contratsErr } = await supabase
    .from('contrats')
    .select('id, projet_id')
    .eq('archive', false)
    .in('projet_id', projetIds);

  if (contratsErr) {
    logger.error('queries.indicateurs', 'progression contrats failed', {
      error: contratsErr,
    });
    return ratios;
  }

  const contrats = (contratsData ?? []) as ContratProjetRow[];
  const contratToProjet = new Map<string, string>();
  for (const c of contrats) contratToProjet.set(c.id, c.projet_id);
  if (contratToProjet.size === 0) return ratios;

  const weeksInPeriod: { current: Date; previous: Date }[] = [];
  if (period === 'week') {
    const currentStart = startOfWeek(reference, { weekStartsOn: 1 });
    weeksInPeriod.push({
      current: currentStart,
      previous: startOfWeek(addWeeks(reference, -1), { weekStartsOn: 1 }),
    });
  } else {
    const monthStart = startOfMonth(reference);
    let ws = startOfWeek(monthStart, { weekStartsOn: 1 });
    if (ws < monthStart)
      ws = startOfWeek(addWeeks(monthStart, 1), { weekStartsOn: 1 });
    const refWeekStart = startOfWeek(reference, { weekStartsOn: 1 });
    for (
      let wk = ws;
      wk <= refWeekStart;
      wk = startOfWeek(addWeeks(wk, 1), { weekStartsOn: 1 })
    ) {
      weeksInPeriod.push({
        current: wk,
        previous: startOfWeek(addWeeks(wk, -1), { weekStartsOn: 1 }),
      });
    }
  }

  if (weeksInPeriod.length === 0) return ratios;

  const weekDates = new Set<string>();
  for (const w of weeksInPeriod) {
    weekDates.add(isoDate(w.current));
    weekDates.add(isoDate(w.previous));
  }

  const contratIds = Array.from(contratToProjet.keys());
  const { data: snapsData, error: snapsErr } = await supabase
    .from('progression_snapshots_weekly')
    .select('contrat_id, semaine_debut, progression_percentage')
    .in('contrat_id', contratIds)
    .in('semaine_debut', Array.from(weekDates));

  if (snapsErr) {
    logger.error('queries.indicateurs', 'progression snapshots failed', {
      error: snapsErr,
    });
    return ratios;
  }

  const snaps = (snapsData ?? []) as SnapshotRow[];
  const snapByContratWeek = new Map<string, number>();
  for (const s of snaps) {
    snapByContratWeek.set(
      `${s.contrat_id}|${s.semaine_debut}`,
      Number(s.progression_percentage),
    );
  }

  const weeklyRatiosByClient = new Map<
    string,
    { realise: number; total: number }[]
  >();

  for (const w of weeksInPeriod) {
    const perClient = new Map<string, { realise: number; total: number }>();
    for (const c of contrats) {
      const clientId = projetToClient.get(c.projet_id);
      if (!clientId) continue;
      const curKey = `${c.id}|${isoDate(w.current)}`;
      const prevKey = `${c.id}|${isoDate(w.previous)}`;
      const cur = snapByContratWeek.get(curKey);
      const prev = snapByContratWeek.get(prevKey);
      if (cur == null || prev == null) continue;
      const delta = cur - prev;
      const entry = perClient.get(clientId) ?? { realise: 0, total: 0 };
      entry.total += 1;
      if (delta >= 2.5) entry.realise += 1;
      perClient.set(clientId, entry);
    }
    for (const [clientId, ratio] of perClient) {
      const arr = weeklyRatiosByClient.get(clientId) ?? [];
      arr.push(ratio);
      weeklyRatiosByClient.set(clientId, arr);
    }
  }

  if (period === 'week') {
    for (const [clientId, arr] of weeklyRatiosByClient) {
      const r = arr[0] ?? { realise: 0, total: 0 };
      ratios.set(clientId, r);
    }
  } else {
    for (const [clientId, arr] of weeklyRatiosByClient) {
      if (arr.length === 0) {
        ratios.set(clientId, { realise: 0, total: 0 });
        continue;
      }
      const pctSum = arr.reduce(
        (acc, r) => acc + (r.total > 0 ? r.realise / r.total : 0),
        0,
      );
      const avgPct = pctSum / arr.length;
      const totalAvg = Math.round(
        arr.reduce((acc, r) => acc + r.total, 0) / arr.length,
      );
      const realiseAvg = Math.round(avgPct * totalAvg);
      ratios.set(clientId, { realise: realiseAvg, total: totalAvg });
    }
  }

  return ratios;
}

async function computeRdvFormateurs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projetToClient: Map<string, string>,
  range: DateRange,
): Promise<Map<string, CdpRatio>> {
  const ratios = new Map<string, CdpRatio>();
  if (projetToClient.size === 0) return ratios;
  const projetIds = Array.from(projetToClient.keys());

  const [realisesRes, totauxRes] = await Promise.all([
    supabase
      .from('rdv_formateurs')
      .select('projet_id')
      .eq('statut', 'realise')
      .gte('date_realisee', isoDate(range.start))
      .lte('date_realisee', isoDate(range.end))
      .in('projet_id', projetIds),
    supabase
      .from('rdv_formateurs')
      .select('projet_id')
      .neq('statut', 'annule')
      .gte('date_prevue', isoDate(range.start))
      .lte('date_prevue', isoDate(range.end))
      .in('projet_id', projetIds),
  ]);

  if (realisesRes.error)
    logger.error('queries.indicateurs', 'rdv_formateurs realise failed', {
      error: realisesRes.error,
    });
  if (totauxRes.error)
    logger.error('queries.indicateurs', 'rdv_formateurs total failed', {
      error: totauxRes.error,
    });

  const realises = (realisesRes.data ?? []) as { projet_id: string }[];
  const totaux = (totauxRes.data ?? []) as { projet_id: string }[];

  for (const r of realises) {
    const clientId = projetToClient.get(r.projet_id);
    if (!clientId) continue;
    const entry = ratios.get(clientId) ?? { realise: 0, total: 0 };
    entry.realise += 1;
    ratios.set(clientId, entry);
  }
  for (const t of totaux) {
    const clientId = projetToClient.get(t.projet_id);
    if (!clientId) continue;
    const entry = ratios.get(clientId) ?? { realise: 0, total: 0 };
    entry.total += 1;
    ratios.set(clientId, entry);
  }

  return ratios;
}

async function computeQualite(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projetToClient: Map<string, string>,
  range: DateRange,
): Promise<Map<string, CdpRatio>> {
  const ratios = new Map<string, CdpRatio>();
  if (projetToClient.size === 0) return ratios;
  const projetIds = Array.from(projetToClient.keys());

  const [realiseesRes, totauxRes] = await Promise.all([
    supabase
      .from('taches_qualite')
      .select('projet_id')
      .eq('fait', true)
      .gte('date_realisation', isoDate(range.start))
      .lte('date_realisation', isoDate(range.end))
      .in('projet_id', projetIds),
    supabase
      .from('taches_qualite')
      .select('projet_id')
      .gte('date_echeance', isoDate(range.start))
      .lte('date_echeance', isoDate(range.end))
      .in('projet_id', projetIds),
  ]);

  if (realiseesRes.error)
    logger.error('queries.indicateurs', 'taches_qualite realisees failed', {
      error: realiseesRes.error,
    });
  if (totauxRes.error)
    logger.error('queries.indicateurs', 'taches_qualite total failed', {
      error: totauxRes.error,
    });

  const realisees = (realiseesRes.data ?? []) as { projet_id: string }[];
  const totaux = (totauxRes.data ?? []) as { projet_id: string }[];

  for (const r of realisees) {
    const clientId = projetToClient.get(r.projet_id);
    if (!clientId) continue;
    const entry = ratios.get(clientId) ?? { realise: 0, total: 0 };
    entry.realise += 1;
    ratios.set(clientId, entry);
  }
  for (const t of totaux) {
    const clientId = projetToClient.get(t.projet_id);
    if (!clientId) continue;
    const entry = ratios.get(clientId) ?? { realise: 0, total: 0 };
    entry.total += 1;
    ratios.set(clientId, entry);
  }

  return ratios;
}

async function computeFacturation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projetToClient: Map<string, string>,
  range: DateRange,
): Promise<{
  ratios: Map<string, CdpRatio>;
  enRetard: Map<string, number>;
}> {
  const ratios = new Map<string, CdpRatio>();
  const enRetard = new Map<string, number>();
  if (projetToClient.size === 0) return { ratios, enRetard };
  const projetIds = Array.from(projetToClient.keys());

  const today = isoDate(new Date());

  const [emisesRes, echeancesRes, retardRes] = await Promise.all([
    supabase
      .from('factures')
      .select('projet_id')
      .eq('statut', 'emise')
      .eq('est_avoir', false)
      .gte('date_emission', isoDate(range.start))
      .lte('date_emission', isoDate(range.end))
      .in('projet_id', projetIds),
    supabase
      .from('echeances')
      .select('projet_id')
      .gte('date_emission_prevue', isoDate(range.start))
      .lte('date_emission_prevue', isoDate(range.end))
      .in('projet_id', projetIds),
    supabase
      .from('factures')
      .select('projet_id')
      .eq('statut', 'en_retard')
      .lt('date_echeance', today)
      .in('projet_id', projetIds),
  ]);

  if (emisesRes.error)
    logger.error('queries.indicateurs', 'factures emises failed', {
      error: emisesRes.error,
    });
  if (echeancesRes.error)
    logger.error('queries.indicateurs', 'echeances failed', {
      error: echeancesRes.error,
    });
  if (retardRes.error)
    logger.error('queries.indicateurs', 'factures en_retard failed', {
      error: retardRes.error,
    });

  const emises = (emisesRes.data ?? []) as { projet_id: string }[];
  const echeances = (echeancesRes.data ?? []) as { projet_id: string }[];
  const retards = (retardRes.data ?? []) as { projet_id: string }[];

  for (const e of emises) {
    const clientId = projetToClient.get(e.projet_id);
    if (!clientId) continue;
    const entry = ratios.get(clientId) ?? { realise: 0, total: 0 };
    entry.realise += 1;
    ratios.set(clientId, entry);
  }
  for (const ec of echeances) {
    const clientId = projetToClient.get(ec.projet_id);
    if (!clientId) continue;
    const entry = ratios.get(clientId) ?? { realise: 0, total: 0 };
    entry.total += 1;
    ratios.set(clientId, entry);
  }
  for (const r of retards) {
    const clientId = projetToClient.get(r.projet_id);
    if (!clientId) continue;
    enRetard.set(clientId, (enRetard.get(clientId) ?? 0) + 1);
  }

  return { ratios, enRetard };
}

export async function getCdpSectionData(
  scope: IndicateursScope,
  period: Period,
  reference: Date = new Date(),
): Promise<CdpRowData[]> {
  try {
    const supabase = await createClient();
    const { projetToClient, clients } = await fetchProjetsScope(
      supabase,
      scope,
    );
    if (clients.size === 0) return [];

    const range = getPeriodRange(period, reference);

    const [progression, rdv, qualite, facturation] = await Promise.all([
      computeProgressionRatios(supabase, projetToClient, period, reference),
      computeRdvFormateurs(supabase, projetToClient, range),
      computeQualite(supabase, projetToClient, range),
      computeFacturation(supabase, projetToClient, range),
    ]);

    const rows: CdpRowData[] = [];
    for (const [clientId, clientNom] of clients) {
      rows.push({
        clientId,
        clientNom,
        progression: progression.get(clientId) ?? { realise: 0, total: 0 },
        rdvFormateurs: rdv.get(clientId) ?? { realise: 0, total: 0 },
        qualite: qualite.get(clientId) ?? { realise: 0, total: 0 },
        facturation: facturation.ratios.get(clientId) ?? {
          realise: 0,
          total: 0,
        },
        facturesEnRetard: facturation.enRetard.get(clientId) ?? 0,
      });
    }

    rows.sort((a, b) => a.clientNom.localeCompare(b.clientNom, 'fr'));
    return rows;
  } catch (error) {
    logger.error('queries.indicateurs', 'getCdpSectionData failed', { error });
    return [];
  }
}

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
        'id, created_at, projet:projets!contrats_projet_id_fkey(client:clients!projets_client_id_fkey(apporteur_commercial_id))',
      )
      .gte('created_at', isoTimestamp(monthRange.start))
      .lte('created_at', isoTimestamp(monthRange.end));

    const volumeQuery = supabase
      .from('contrats')
      .select(
        'id, projet:projets!contrats_projet_id_fkey(client:clients!projets_client_id_fkey(apporteur_commercial_id))',
      )
      .eq('archive', false)
      .in('contract_state', ['actif', 'en_cours', 'signe']);

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
      apprenantsApportes: apportes.length,
      volumeAlternants: volume.length,
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

export async function getTechCounters(
  period: TechPeriod,
  reference: Date = new Date(),
): Promise<TechCounters> {
  try {
    const supabase = await createClient();
    const range = getTechRange(period, reference);

    const [proposeesRes, implementeesRes] = await Promise.all([
      supabase
        .from('idees')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', isoTimestamp(range.start))
        .lte('created_at', isoTimestamp(range.end)),
      supabase
        .from('idees')
        .select('id', { count: 'exact', head: true })
        .eq('statut', 'implementee')
        .gte('implementee_at', isoTimestamp(range.start))
        .lte('implementee_at', isoTimestamp(range.end)),
    ]);

    if (proposeesRes.error)
      logger.error('queries.indicateurs', 'tech proposees failed', {
        error: proposeesRes.error,
      });
    if (implementeesRes.error)
      logger.error('queries.indicateurs', 'tech implementees failed', {
        error: implementeesRes.error,
      });

    return {
      ideesProposees: proposeesRes.count ?? 0,
      ideesImplementees: implementeesRes.count ?? 0,
    };
  } catch (error) {
    logger.error('queries.indicateurs', 'getTechCounters failed', { error });
    return { ideesProposees: 0, ideesImplementees: 0 };
  }
}
