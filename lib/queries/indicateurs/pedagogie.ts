// lib/queries/indicateurs/pedagogie.ts
// Avancement contrats, progressions, RDV formateurs, section CdP.
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { computeQualiopiCompletionForClients } from '@/lib/queries/qualiopi-stats';
import { startOfWeek, startOfMonth, addWeeks } from 'date-fns';
import {
  type IndicateursScope,
  type Period,
  type DateRange,
  type CdpRatio,
  type CdpRowData,
  isoDate,
  getPeriodRange,
  fetchProjetsScope,
} from './shared';

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
      // "Realise" = un contrat qui a effectivement progresse cette semaine
      // (delta strict > 0). Le seuil >= 2.5 historique etait trop strict :
      // un apprenant qui avance d'1 % par semaine etait classe "non realise".
      if (delta > 0) entry.realise += 1;
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
  _supabase: Awaited<ReturnType<typeof createClient>>,
  projetToClient: Map<string, string>,
  _range: DateRange,
): Promise<Map<string, CdpRatio>> {
  // Snapshot Qualiopi via Eduvia : ratio (deliverables conform) /
  // (deliverables total) agrege par CFA (clientId).
  // Le range temporel n'a pas d'equivalent natif Eduvia (les statuts sont
  // un etat present), on retourne donc un instantane.
  const clientIds = Array.from(new Set(projetToClient.values()));
  return computeQualiopiCompletionForClients(clientIds);
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
