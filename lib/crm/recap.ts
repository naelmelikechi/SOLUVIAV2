import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/crm/database.types';
import {
  formatDateParis,
  formatDateTimeParis,
  parisDateOnly,
} from '@/lib/utils/formatters';
import { sendEmail, recapEmail } from '@/lib/crm/email';
import {
  apprentisEnPipeline,
  conversionRate,
  computeFunnel,
  type OppLite,
  type EtapeLite,
} from '@/lib/crm/domain/pipeline';
import {
  computeRecapPeriod,
  computeDormantes,
  statsParCommercial,
  type RecapModel,
} from '@/lib/crm/domain/recap';
import { fetchRecapData, type RecapRaw } from '@/lib/crm/queries/recap';

type DB = SupabaseClient<Database, 'crm'>;

function commerciauxLabel(
  rows: { profile: { nom_complet: string | null } | null }[],
): string | null {
  const noms = rows
    .map((r) => r.profile?.nom_complet)
    .filter(Boolean) as string[];
  return noms.length ? noms.join(', ') : null;
}

/** Assemble le modèle du mail (pur, hors I/O) à partir des données brutes + période. */
export function assembleModel(
  raw: RecapRaw,
  now: Date,
  periodeLabel: string,
): RecapModel {
  const opps = raw.opps as unknown as OppLite[];
  const funnel = computeFunnel(opps, raw.etapes as unknown as EtapeLite[]).map(
    (f) => ({ libelle: f.etape.libelle, count: f.count }),
  );
  const relMap = (r: RecapRaw['relEnRetard'][number]) => ({
    titre: r.titre,
    compte: r.compte?.nom ?? null,
    echeance: formatDateParis(r.date_echeance),
    assignee: r.assignee?.nom_complet ?? null,
  });
  const rdvMap = (r: RecapRaw['rdvAvenir'][number]) => ({
    titre: r.titre,
    compte: r.compte?.nom ?? null,
    quand: formatDateTimeParis(r.debut),
    commerciaux: commerciauxLabel(r.commerciaux ?? []),
  });
  return {
    periodeLabel,
    kpis: {
      apprentis: apprentisEnPipeline(opps),
      ouvertes: opps.filter((o) => o.statut === 'ouverte').length,
      conversion: conversionRate(opps),
      relancesDues: raw.relEnRetard.length + raw.relAujourdhui.length,
    },
    relancesEnRetard: raw.relEnRetard.map(relMap),
    relancesAujourdhui: raw.relAujourdhui.map(relMap),
    rdvAvenir: raw.rdvAvenir.map(rdvMap),
    dormantes: computeDormantes(raw.risks.dormanteInputs, now).slice(0, 8),
    rdvADebriefer: raw.risks.rdvADebriefer.slice(0, 8).map((r) => ({
      titre: r.titre,
      compte: r.compte?.nom ?? null,
      quand: formatDateTimeParis(r.debut),
      commerciaux: null,
    })),
    delta: {
      nouvelles: raw.nouvelles,
      gagnees: raw.gagnees.map((o) => ({
        intitule: o.intitule,
        compte: o.compte?.nom ?? null,
      })),
      perdues: raw.perdues.map((o) => ({
        intitule: o.intitule,
        compte: o.compte?.nom ?? null,
        motif: o.motif_perte,
      })),
      activites: raw.activites,
      rdvRealises: raw.rdvRealises,
      relancesFaites: raw.relancesFaites,
    },
    funnel,
    parCommercial: statsParCommercial(raw.opps),
  };
}

export type BuiltRecap = { subject: string; html: string; model: RecapModel };

/** Construit le récap (données + modèle + HTML). Aucun envoi. */
export async function buildRecap(
  sb: DB,
  now: Date = new Date(),
): Promise<BuiltRecap> {
  const period = computeRecapPeriod(now);
  const raw = await fetchRecapData(sb, period);
  const model = assembleModel(raw, now, period.label);
  const { subject, html } = recapEmail(model);
  return { subject, html, model };
}

export type SendRecapResult = {
  sent: boolean;
  skipped?: 'already_sent';
  recipients: string[];
  bcc: string[];
  subject: string;
};

/** Construit ET envoie le récap. Journalise dans `recaps` (best-effort). */
export async function sendRecap(
  sb: DB,
  opts: { now?: Date; trigger: 'cron' | 'manuel'; actorId?: string | null },
): Promise<SendRecapResult> {
  const now = opts.now ?? new Date();
  const recapDate = parisDateOnly(now);
  const to = (process.env.RECAP_RECIPIENTS || 'iladj@mysoluvia.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean); // destinataires (RECAP_RECIPIENTS, CSV)
  const bcc = (process.env.RECAP_BCC || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean); // copie cachée (RECAP_BCC, CSV)

  // Idempotence cron : ce SELECT (et non l'index unique) est la vraie garde anti-doublon d'EMAIL.
  // L'index recaps_cron_daily_idx est un backstop de la TABLE ; course concurrente tolérée (cron Vercel non concurrent).
  if (opts.trigger === 'cron') {
    const { data } = await sb
      .from('recaps')
      .select('id, sujet')
      .eq('recap_date', recapDate)
      .eq('trigger', 'cron')
      .limit(1)
      .maybeSingle();
    if (data) {
      return {
        sent: false,
        skipped: 'already_sent',
        recipients: to,
        bcc,
        subject: data.sujet,
      };
    }
  }

  const { subject, html, model } = await buildRecap(sb, now);
  await sendEmail(to, subject, html, bcc);

  // Journal best-effort (table absente ⇒ on ignore).
  try {
    await sb.from('recaps').insert({
      recap_date: recapDate,
      trigger: opts.trigger,
      destinataires: to.join(','),
      sujet: subject,
      actor_id: opts.actorId ?? null,
      meta: {
        relancesEnRetard: model.relancesEnRetard.length,
        relancesAujourdhui: model.relancesAujourdhui.length,
        rdvAvenir: model.rdvAvenir.length,
        dormantes: model.dormantes.length,
        rdvADebriefer: model.rdvADebriefer.length,
        kpis: model.kpis,
      },
    });
  } catch {
    /* best-effort */
  }

  return { sent: true, recipients: to, bcc, subject };
}
