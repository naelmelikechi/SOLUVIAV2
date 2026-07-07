import { TZ, parisDateOnly } from './dates';

const RECAP_DOWS = [1, 3, 5]; // lundi, mercredi, vendredi (0=dimanche)
const DAY_MS = 86_400_000;
const DORMANT_DAYS = 14;

// ─────────────────────────── Fuseau Paris ───────────────────────────

/** Jour de la semaine à Paris (0=dim..6=sam). */
export function parisDow(now: Date): number {
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
  }).format(now);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
}

/** Décalage (ms) Paris↔UTC à cet instant (été = +7 200 000). */
function parisOffsetMs(d: Date): number {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  const asUtc = Date.UTC(
    g('year'),
    g('month') - 1,
    g('day'),
    g('hour') === 24 ? 0 : g('hour'),
    g('minute'),
    g('second'),
  );
  return asUtc - d.getTime();
}

/** Instant UTC correspondant à 00:00 Paris du jour calendaire Paris contenant `d`. */
export function parisStartOfDay(d: Date): Date {
  const ymd = parisDateOnly(d);
  const guess = new Date(`${ymd}T00:00:00Z`); // minuit UTC de ce jour
  return new Date(guess.getTime() - parisOffsetMs(guess));
}

// ─────────────────────────── Fenêtre récap ───────────────────────────

export type RecapPeriod = {
  start: Date; // début fenêtre "depuis le dernier récap" (00:00 Paris)
  end: Date; // maintenant
  nextRecap: Date; // 00:00 Paris du prochain jour de récap
  startDateOnly: string; // "YYYY-MM-DD" Paris
  nextRecapDateOnly: string;
  label: string; // "26 juin → 1 juil." (FR)
};

function daysBackToRecap(dow: number): number {
  for (let b = 1; b <= 7; b++)
    if (RECAP_DOWS.includes((dow - b + 7) % 7)) return b;
  return 2;
}
function daysFwdToRecap(dow: number): number {
  for (let f = 1; f <= 7; f++) if (RECAP_DOWS.includes((dow + f) % 7)) return f;
  return 2;
}

function frDate(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    timeZone: TZ,
  });
}

export function computeRecapPeriod(now: Date): RecapPeriod {
  const dow = parisDow(now);
  const todayStart = parisStartOfDay(now);
  // Ancrage midi Paris avant l'arithmétique : un décalage DST de ±1 h ne peut plus
  // franchir minuit, donc le re-snap retombe toujours sur le bon jour calendaire.
  const midi = todayStart.getTime() + DAY_MS / 2;
  const start = parisStartOfDay(new Date(midi - daysBackToRecap(dow) * DAY_MS));
  const nextRecap = parisStartOfDay(
    new Date(midi + daysFwdToRecap(dow) * DAY_MS),
  );
  return {
    start,
    end: now,
    nextRecap,
    startDateOnly: parisDateOnly(start),
    nextRecapDateOnly: parisDateOnly(nextRecap),
    label: `${frDate(start)} → ${frDate(now)}`,
  };
}

// ─────────────────────────── Opportunités dormantes ───────────────────────────

export type DormanteInput = {
  id: string;
  intitule: string;
  statut: string;
  owner: { nom_complet: string | null } | null;
  compte: { nom: string | null } | null;
  activites: { created_at: string }[];
  relances: {
    date_echeance: string;
    fait: boolean;
    archived_at: string | null;
  }[];
  rdv: { debut: string }[];
};

export type Dormante = {
  id: string;
  intitule: string;
  compte: string | null;
  owner: string | null;
  joursInactif: number;
};

/** Opportunités ouvertes sans activité depuis DORMANT_DAYS ET sans relance/RDV futur. Triées du plus dormant au moins. */
export function computeDormantes(opps: DormanteInput[], now: Date): Dormante[] {
  const nowMs = now.getTime();
  const seuil = nowMs - DORMANT_DAYS * DAY_MS;
  const out: Dormante[] = [];
  for (const o of opps) {
    if (o.statut !== 'ouverte') continue;
    const derniereActivite = o.activites.reduce(
      (mx, a) => Math.max(mx, new Date(a.created_at).getTime()),
      0,
    );
    if (derniereActivite > seuil) continue; // touchée récemment
    const relanceFuture = o.relances.some(
      (r) =>
        !r.fait &&
        !r.archived_at &&
        new Date(r.date_echeance).getTime() >= nowMs,
    );
    if (relanceFuture) continue;
    const rdvFutur = o.rdv.some((r) => new Date(r.debut).getTime() >= nowMs);
    if (rdvFutur) continue;
    const ref = derniereActivite || seuil; // pas d'activité connue → considéré dormant au moins depuis le seuil
    const joursInactif = Math.max(
      DORMANT_DAYS,
      Math.floor((nowMs - ref) / DAY_MS),
    );
    out.push({
      id: o.id,
      intitule: o.intitule,
      compte: o.compte?.nom ?? null,
      owner: o.owner?.nom_complet ?? null,
      joursInactif,
    });
  }
  return out.sort((a, b) => b.joursInactif - a.joursInactif);
}

// ─────────────────────────── Stats par commercial ───────────────────────────

export type OwnerStatInput = {
  statut: string;
  nb_alternants?: number | null;
  owner: { nom_complet: string | null } | null;
};
export type OwnerStat = { nom: string; ouvertes: number; apprentis: number };

export function statsParCommercial(opps: OwnerStatInput[]): OwnerStat[] {
  const map = new Map<string, OwnerStat>();
  for (const o of opps) {
    if (o.statut !== 'ouverte') continue;
    const nom = o.owner?.nom_complet ?? 'Non attribué';
    const cur = map.get(nom) ?? { nom, ouvertes: 0, apprentis: 0 };
    cur.ouvertes += 1;
    cur.apprentis += o.nb_alternants ?? 0;
    map.set(nom, cur);
  }
  return [...map.values()].sort((a, b) => b.ouvertes - a.ouvertes);
}

// ─────────────────────────── Modèle du mail ───────────────────────────

export type RecapRelance = {
  titre: string;
  compte: string | null;
  echeance: string;
  assignee: string | null;
};
export type RecapRdv = {
  titre: string;
  compte: string | null;
  quand: string;
  commerciaux: string | null;
};
export type RecapOppMini = {
  intitule: string;
  compte: string | null;
  motif?: string | null;
};

export type RecapModel = {
  periodeLabel: string;
  kpis: {
    apprentis: number;
    ouvertes: number;
    conversion: number;
    relancesDues: number;
  };
  relancesEnRetard: RecapRelance[];
  relancesAujourdhui: RecapRelance[];
  rdvAvenir: RecapRdv[];
  dormantes: Dormante[];
  rdvADebriefer: RecapRdv[];
  delta: {
    nouvelles: number;
    gagnees: RecapOppMini[];
    perdues: RecapOppMini[];
    activites: number;
    rdvRealises: number;
    relancesFaites: number;
  };
  funnel: { libelle: string; count: number }[];
  parCommercial: OwnerStat[];
};
