import {
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfQuarter,
  endOfQuarter,
  subQuarters,
  startOfYear,
  endOfYear,
  subYears,
} from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import {
  STAGE_PROSPECT_ORDER,
  STAGE_PROSPECT_LABELS,
  CANAL_ORIGINE_LABELS,
  TYPE_PROSPECT_LABELS,
  type StageProspect,
  type CanalOrigine,
} from '@/lib/utils/constants';
import type { Database } from '@/types/database';

// ---------------------------------------------------------------------------
// Types publics (Feature 8 - tableau de bord commercial, calcul a la volee)
// ---------------------------------------------------------------------------

export type PeriodeKpi = 'mois' | 'mois_precedent' | 'trimestre' | 'annee';
export type TunnelKpi = 'cfa' | 'entreprise';

export interface CommercialKpisFilters {
  periode: PeriodeKpi;
  tunnel?: TunnelKpi;
  commercialId?: string;
}

/** Une mesure comparee a la periode precedente (pour les fleches d'evolution). */
export interface VolumeMetric {
  value: number;
  previous: number;
}

export interface VolumeKpis {
  /** Prospects actifs : stage != perdu, non archives (snapshot). */
  actifs: number;
  /** Prospects qualifies : stage >= presente, non archives (snapshot). */
  qualifies: number;
  /** Prospects entres dans le pipeline sur la periode (created_at). */
  nouveaux: VolumeMetric;
  /** Signatures sur la periode (signature_requests.signed_at OU passage a signe). */
  signatures: VolumeMetric;
}

export interface FunnelStep {
  stage: StageProspect;
  label: string;
  count: number;
  /** Taux de conversion depuis l'etape precedente (ratio 0..1), null pour la 1re. */
  conversion: number | null;
}

export interface CycleStats {
  count: number;
  moyenJours: number;
  medianJours: number;
}

export interface TunnelComparisonRow {
  tunnel: TunnelKpi;
  label: string;
  volumeActif: number;
  signatures: number;
  /** Somme volume_apprenants des deals signes sur la periode (proxy CA). */
  apprenantsSignes: number;
  /** Ticket moyen = apprenants signes / nb signatures. */
  ticketMoyen: number;
  cycleMedianJours: number;
}

export interface OrigineLeadRow {
  canal: CanalOrigine | 'non_renseigne';
  label: string;
  count: number;
  pct: number;
}

export interface AlerteProspect {
  id: string;
  nom: string;
  stage: StageProspect;
  joursInactif: number;
}

export type AlerteType = 'sans_action' | 'a_signer_bloque' | 'sans_commercial';

export interface AlerteGroup {
  type: AlerteType;
  label: string;
  count: number;
  /** Echantillon (les plus urgents) pour affichage / navigation. */
  prospects: AlerteProspect[];
}

export interface CommercialKpis {
  periode: PeriodeKpi;
  tunnel: TunnelKpi | null;
  commercialId: string | null;
  generatedAt: string;
  volume: VolumeKpis;
  funnel: FunnelStep[];
  cycle: CycleStats;
  tunnels: TunnelComparisonRow[];
  origine: OrigineLeadRow[];
  alertes: AlerteGroup[];
}

// ---------------------------------------------------------------------------
// Calculs purs (testes unitairement dans __tests__/commercial-kpis.test.ts)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/** Etapes lineaires de l'entonnoir (perdu = etat terminal, hors conversion). */
export const FUNNEL_STAGES: StageProspect[] = STAGE_PROSPECT_ORDER.filter(
  (s) => s !== 'perdu',
);

/** Rang d'une etape dans l'entonnoir lineaire ; -1 si hors entonnoir (perdu). */
export function funnelIndex(stage: StageProspect): number {
  return FUNNEL_STAGES.indexOf(stage);
}

/**
 * Rang max de l'entonnoir atteint par un prospect, deduit de son stage courant
 * et de l'historique de ses transitions. -1 si aucune etape d'entonnoir.
 */
export function maxReachedFunnelIndex(
  currentStage: StageProspect,
  historyStages: StageProspect[],
): number {
  let max = funnelIndex(currentStage);
  for (const s of historyStages) {
    const idx = funnelIndex(s);
    if (idx > max) max = idx;
  }
  return max;
}

/**
 * Construit l'entonnoir avec le taux de conversion etape -> etape.
 * conversion = count / count(precedent) : 0..1, null pour la 1re etape,
 * 0 si l'etape precedente est vide (aucun flux).
 */
export function computeFunnelConversion(
  steps: { stage: StageProspect; count: number }[],
): FunnelStep[] {
  return steps.map((step, i) => {
    const prev = i > 0 ? (steps[i - 1]?.count ?? 0) : null;
    const conversion =
      prev === null ? null : prev === 0 ? 0 : step.count / prev;
    return {
      stage: step.stage,
      label: STAGE_PROSPECT_LABELS[step.stage],
      count: step.count,
      conversion,
    };
  });
}

/**
 * Statistiques de cycle (moyenne + mediane) sur une liste de durees en jours.
 * Ignore les durees non finies ou negatives. Arrondi a 1 decimale.
 */
export function computeCycleStats(dureesJours: number[]): CycleStats {
  const valid = dureesJours.filter((d) => Number.isFinite(d) && d >= 0);
  const count = valid.length;
  if (count === 0) return { count: 0, moyenJours: 0, medianJours: 0 };

  const sum = valid.reduce((acc, d) => acc + d, 0);
  const moyen = sum / count;

  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(count / 2);
  const median =
    count % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : (sorted[mid] ?? 0);

  return {
    count,
    moyenJours: Math.round(moyen * 10) / 10,
    medianJours: Math.round(median * 10) / 10,
  };
}

interface PeriodeRange {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
}

/** Borne la periode courante et la periode precedente (pour comparaison). */
export function resolvePeriodeRange(
  periode: PeriodeKpi,
  now: Date,
): PeriodeRange {
  switch (periode) {
    case 'mois_precedent': {
      const base = subMonths(now, 1);
      const prev = subMonths(base, 1);
      return {
        start: startOfMonth(base),
        end: endOfMonth(base),
        prevStart: startOfMonth(prev),
        prevEnd: endOfMonth(prev),
      };
    }
    case 'trimestre': {
      const prev = subQuarters(now, 1);
      return {
        start: startOfQuarter(now),
        end: endOfQuarter(now),
        prevStart: startOfQuarter(prev),
        prevEnd: endOfQuarter(prev),
      };
    }
    case 'annee': {
      const prev = subYears(now, 1);
      return {
        start: startOfYear(now),
        end: endOfYear(now),
        prevStart: startOfYear(prev),
        prevEnd: endOfYear(prev),
      };
    }
    case 'mois':
    default: {
      const prev = subMonths(now, 1);
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
        prevStart: startOfMonth(prev),
        prevEnd: endOfMonth(prev),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Couche donnees : agregation en memoire (peu de requetes, pas de N+1)
// ---------------------------------------------------------------------------

type ProspectKpiRow = Pick<
  Database['public']['Tables']['prospects']['Row'],
  | 'id'
  | 'nom'
  | 'stage'
  | 'type_prospect'
  | 'canal_origine'
  | 'commercial_id'
  | 'volume_apprenants'
  | 'created_at'
  | 'derniere_action_at'
  | 'archive'
>;

const TUNNEL_LABELS: Record<TunnelKpi, string> = {
  entreprise: `Tunnel A - ${TYPE_PROSPECT_LABELS.entreprise}`,
  cfa: `Tunnel B - ${TYPE_PROSPECT_LABELS.cfa}`,
};

function inWindow(date: Date | undefined, start: Date, end: Date): boolean {
  return !!date && date >= start && date <= end;
}

/**
 * Calcule l'ensemble des KPI commerciaux a la volee a partir d'un client
 * Supabase (RLS pour la page serveur, admin pour le cron). 3 requetes, tout le
 * reste est agrege en memoire.
 */
export async function computeCommercialKpis(
  supabase: SupabaseClient<Database>,
  filters: CommercialKpisFilters,
  now: Date = new Date(),
): Promise<CommercialKpis> {
  const { periode, tunnel, commercialId } = filters;
  const range = resolvePeriodeRange(periode, now);

  // --- 1. Prospects (scope commercial, archives inclus pour l'entonnoir et
  //        les signatures ; l'archivage est filtre en memoire par bloc).
  let prospectsQuery = supabase
    .from('prospects')
    .select(
      'id, nom, stage, type_prospect, canal_origine, commercial_id, volume_apprenants, created_at, derniere_action_at, archive',
    );
  if (commercialId)
    prospectsQuery = prospectsQuery.eq('commercial_id', commercialId);
  const { data: prospectsData, error: prospectsErr } = await prospectsQuery;
  if (prospectsErr) {
    logger.error('queries.commercial-kpis', 'prospects select failed', {
      error: prospectsErr,
    });
  }
  const prospects: ProspectKpiRow[] = prospectsData ?? [];
  const prospectIds = new Set(prospects.map((p) => p.id));

  // --- 2. Historique des transitions (scope via l'ensemble des prospects).
  const { data: historyData, error: historyErr } = await supabase
    .from('prospect_stage_history')
    .select('prospect_id, to_stage, changed_at');
  if (historyErr) {
    logger.error('queries.commercial-kpis', 'stage history select failed', {
      error: historyErr,
    });
  }
  const historyByProspect = new Map<string, StageProspect[]>();
  const signeDateByProspect = new Map<string, Date>();
  for (const row of historyData ?? []) {
    if (!prospectIds.has(row.prospect_id)) continue;
    const stages = historyByProspect.get(row.prospect_id);
    if (stages) stages.push(row.to_stage);
    else historyByProspect.set(row.prospect_id, [row.to_stage]);
    if (row.to_stage === 'signe' && row.changed_at) {
      const d = new Date(row.changed_at);
      const existing = signeDateByProspect.get(row.prospect_id);
      if (!existing || d < existing)
        signeDateByProspect.set(row.prospect_id, d);
    }
  }

  // --- 3. Signatures (statut signee) sur la fenetre courante + precedente,
  //        seconde source du passage a "signe" (OU stage history).
  const { data: signaturesData, error: signaturesErr } = await supabase
    .from('signature_requests')
    .select('prospect_id, signed_at')
    .eq('statut', 'signee')
    .not('signed_at', 'is', null)
    .gte('signed_at', range.prevStart.toISOString())
    .lte('signed_at', range.end.toISOString());
  if (signaturesErr) {
    logger.error('queries.commercial-kpis', 'signatures select failed', {
      error: signaturesErr,
    });
  }
  for (const row of signaturesData ?? []) {
    if (!prospectIds.has(row.prospect_id) || !row.signed_at) continue;
    const d = new Date(row.signed_at);
    const existing = signeDateByProspect.get(row.prospect_id);
    if (!existing || d < existing) signeDateByProspect.set(row.prospect_id, d);
  }

  // ----- Sous-ensembles ----------------------------------------------------
  const scoped = tunnel
    ? prospects.filter((p) => p.type_prospect === tunnel)
    : prospects;
  const active = scoped.filter((p) => !p.archive);
  const presenteIdx = funnelIndex('presente');

  // ----- Bloc VOLUME -------------------------------------------------------
  const actifs = active.filter((p) => p.stage !== 'perdu').length;
  const qualifies = active.filter(
    (p) => p.stage !== 'perdu' && funnelIndex(p.stage) >= presenteIdx,
  ).length;

  const volume: VolumeKpis = {
    actifs,
    qualifies,
    nouveaux: {
      value: scoped.filter((p) =>
        inWindow(new Date(p.created_at), range.start, range.end),
      ).length,
      previous: scoped.filter((p) =>
        inWindow(new Date(p.created_at), range.prevStart, range.prevEnd),
      ).length,
    },
    signatures: {
      value: scoped.filter((p) =>
        inWindow(signeDateByProspect.get(p.id), range.start, range.end),
      ).length,
      previous: scoped.filter((p) =>
        inWindow(signeDateByProspect.get(p.id), range.prevStart, range.prevEnd),
      ).length,
    },
  };

  // ----- Bloc ENTONNOIR (cumul "a atteint l'etape", depuis l'historique) ---
  const reachCounts = FUNNEL_STAGES.map(() => 0);
  for (const p of scoped) {
    const histStages = historyByProspect.get(p.id) ?? [];
    const reached = Math.max(0, maxReachedFunnelIndex(p.stage, histStages));
    for (let k = 0; k <= reached; k++)
      reachCounts[k] = (reachCounts[k] ?? 0) + 1;
  }
  const funnel = computeFunnelConversion(
    FUNNEL_STAGES.map((stage, i) => ({ stage, count: reachCounts[i] ?? 0 })),
  );

  // ----- Bloc CYCLE (creation -> signe, signatures de la periode) ----------
  const cycleDurations: number[] = [];
  for (const p of scoped) {
    const signe = signeDateByProspect.get(p.id);
    if (!inWindow(signe, range.start, range.end)) continue;
    const days =
      ((signe as Date).getTime() - new Date(p.created_at).getTime()) / DAY_MS;
    cycleDurations.push(days);
  }
  const cycle = computeCycleStats(cycleDurations);

  // ----- Bloc TUNNEL A / B (toujours les deux, scope commercial seulement) -
  const tunnels: TunnelComparisonRow[] = (
    ['entreprise', 'cfa'] as TunnelKpi[]
  ).map((t) => {
    const setT = prospects.filter((p) => p.type_prospect === t);
    const volumeActif = setT.filter(
      (p) => !p.archive && p.stage !== 'perdu',
    ).length;
    const signed = setT.filter((p) =>
      inWindow(signeDateByProspect.get(p.id), range.start, range.end),
    );
    const apprenantsSignes = signed.reduce(
      (acc, p) => acc + (p.volume_apprenants ?? 0),
      0,
    );
    const ticketMoyen =
      signed.length > 0
        ? Math.round((apprenantsSignes / signed.length) * 10) / 10
        : 0;
    const cycleT = computeCycleStats(
      signed.map(
        (p) =>
          ((signeDateByProspect.get(p.id) as Date).getTime() -
            new Date(p.created_at).getTime()) /
          DAY_MS,
      ),
    );
    return {
      tunnel: t,
      label: TUNNEL_LABELS[t],
      volumeActif,
      signatures: signed.length,
      apprenantsSignes,
      ticketMoyen,
      cycleMedianJours: cycleT.medianJours,
    };
  });

  // ----- Bloc ORIGINE des leads (snapshot du pipeline actif scope) ---------
  const origineKeys: (CanalOrigine | 'non_renseigne')[] = [
    ...(Object.keys(CANAL_ORIGINE_LABELS) as CanalOrigine[]),
    'non_renseigne',
  ];
  const origineCounts: Record<CanalOrigine | 'non_renseigne', number> =
    Object.fromEntries(origineKeys.map((k) => [k, 0])) as Record<
      CanalOrigine | 'non_renseigne',
      number
    >;
  for (const p of active) {
    const key = (p.canal_origine ?? 'non_renseigne') as
      | CanalOrigine
      | 'non_renseigne';
    origineCounts[key] += 1;
  }
  const origineTotal = active.length;
  const origine: OrigineLeadRow[] = origineKeys
    .map((canal) => {
      const count = origineCounts[canal];
      return {
        canal,
        label:
          canal === 'non_renseigne'
            ? 'Non renseigné'
            : CANAL_ORIGINE_LABELS[canal],
        count,
        pct:
          origineTotal > 0 ? Math.round((count / origineTotal) * 1000) / 10 : 0,
      };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);

  // ----- Bloc ALERTES ------------------------------------------------------
  const nowMs = now.getTime();
  const joursInactif = (p: ProspectKpiRow) =>
    Math.floor((nowMs - new Date(p.derniere_action_at).getTime()) / DAY_MS);
  const toAlerte = (p: ProspectKpiRow): AlerteProspect => ({
    id: p.id,
    nom: p.nom,
    stage: p.stage,
    joursInactif: joursInactif(p),
  });
  const byInactifDesc = (a: AlerteProspect, b: AlerteProspect) =>
    b.joursInactif - a.joursInactif;
  const SAMPLE = 8;

  const sansAction = active
    .filter((p) => p.stage !== 'perdu' && joursInactif(p) > 14)
    .map(toAlerte)
    .sort(byInactifDesc);
  const aSignerBloque = active
    .filter((p) => p.stage === 'audite' && joursInactif(p) > 14)
    .map(toAlerte)
    .sort(byInactifDesc);
  const sansCommercial = active
    .filter((p) => p.stage !== 'perdu' && !p.commercial_id)
    .map(toAlerte)
    .sort(byInactifDesc);

  const alertes: AlerteGroup[] = [
    {
      type: 'sans_action',
      label: 'Sans action depuis plus de 14 jours',
      count: sansAction.length,
      prospects: sansAction.slice(0, SAMPLE),
    },
    {
      type: 'a_signer_bloque',
      label: 'Audités en attente de signature (plus de 14 jours)',
      count: aSignerBloque.length,
      prospects: aSignerBloque.slice(0, SAMPLE),
    },
    {
      type: 'sans_commercial',
      label: 'Sans commercial assigné',
      count: sansCommercial.length,
      prospects: sansCommercial.slice(0, SAMPLE),
    },
  ];

  return {
    periode,
    tunnel: tunnel ?? null,
    commercialId: commercialId ?? null,
    generatedAt: now.toISOString(),
    volume,
    funnel,
    cycle,
    tunnels,
    origine,
    alertes,
  };
}

/**
 * Entree page serveur : resout le client Supabase (RLS) puis agrege les KPI.
 */
export async function getCommercialKpis(
  filters: CommercialKpisFilters,
): Promise<CommercialKpis> {
  const supabase = await createClient();
  return computeCommercialKpis(supabase, filters);
}
