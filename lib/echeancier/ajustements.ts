import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';
import {
  computeDerivance,
  computeProrataRupture,
  type BilledLine,
} from './calc';
import { logger } from '@/lib/utils/logger';

const SCOPE = 'echeancier.ajustements';

type Client = SupabaseClient<Database>;

/**
 * Lit les facture_lignes deja emises pour un contrat donne avec snapshots.
 */
async function loadBilledLines(
  supabase: Client,
  contratId: string,
): Promise<BilledLine[]> {
  const { data, error } = await supabase
    .from('facture_lignes')
    .select(
      'montant_ht, npec_snapshot, taux_commission_snapshot, quote_part, factures!inner(id, ref, est_avoir)',
    )
    .eq('contrat_id', contratId)
    .not('npec_snapshot', 'is', null)
    .not('quote_part', 'is', null);
  if (error) {
    logger.error(SCOPE, 'load billed lines failed', { error, contratId });
    return [];
  }
  const lines: BilledLine[] = [];
  for (const row of data ?? []) {
    const f = row.factures as {
      id: string;
      ref: string | null;
      est_avoir: boolean;
    } | null;
    if (!f || f.est_avoir) continue;
    if (
      row.montant_ht == null ||
      row.npec_snapshot == null ||
      row.taux_commission_snapshot == null ||
      row.quote_part == null
    ) {
      continue;
    }
    lines.push({
      facture_id: f.id,
      facture_ref: f.ref ?? f.id,
      montant_ht: Number(row.montant_ht),
      npec_snapshot: Number(row.npec_snapshot),
      taux_commission_snapshot: Number(row.taux_commission_snapshot),
      quote_part: Number(row.quote_part),
    });
  }
  return lines;
}

/**
 * Detecte un changement NPEC sur un contrat et insere un ajustement en attente
 * si une derive est detectee sur les factures deja emises.
 *
 * Retourne le delta_ht detecte (0 = pas d'ajustement cree).
 */
export async function detectNpecChangeAjustement(
  supabase: Client,
  contratId: string,
  npecActuel: number,
): Promise<number> {
  // contrat + billedLines en parallele : les 2 dependent juste de contratId.
  // Si contrat fail, on a paye loadBilledLines pour rien (cas rare).
  const [contratRes, billedLines] = await Promise.all([
    supabase
      .from('contrats')
      .select('id, projet_id, projets!inner(taux_commission)')
      .eq('id', contratId)
      .maybeSingle(),
    loadBilledLines(supabase, contratId),
  ]);

  const { data: contrat, error: contratErr } = contratRes;
  if (contratErr || !contrat) return 0;

  const projet = contrat.projets as { taux_commission: number | null } | null;
  const tauxActuel = Number(projet?.taux_commission ?? 0);
  if (tauxActuel <= 0) return 0;

  if (billedLines.length === 0) return 0;

  const result = computeDerivance(npecActuel, tauxActuel, billedLines);
  if (Math.abs(result.delta_ht) < 0.01) return 0;

  const { error: existingErr, data: existing } = await supabase
    .from('facturation_ajustements_pending')
    .select('id')
    .eq('contrat_id', contratId)
    .eq('type', 'npec_change')
    .is('resolved_at', null)
    .maybeSingle();
  if (existingErr) {
    logger.error(SCOPE, 'check existing ajustement failed', { existingErr });
    return 0;
  }

  const detail = {
    npec_actuel: npecActuel,
    taux_commission: tauxActuel,
    breakdown: result.breakdown,
  } as unknown as Json;

  if (existing?.id) {
    const { error } = await supabase
      .from('facturation_ajustements_pending')
      .update({
        delta_ht: result.delta_ht,
        detail,
        motif: `NPEC modifie -> ${result.delta_ht > 0 ? 'facture complementaire' : 'avoir'} de ${Math.abs(result.delta_ht).toFixed(2)} EUR HT`,
      })
      .eq('id', existing.id);
    if (error) {
      logger.error(SCOPE, 'update ajustement failed', { error });
      return 0;
    }
  } else {
    const { error } = await supabase
      .from('facturation_ajustements_pending')
      .insert({
        projet_id: contrat.projet_id,
        contrat_id: contratId,
        type: 'npec_change',
        delta_ht: result.delta_ht,
        detail,
        motif: `NPEC modifie -> ${result.delta_ht > 0 ? 'facture complementaire' : 'avoir'} de ${Math.abs(result.delta_ht).toFixed(2)} EUR HT`,
      });
    if (error) {
      logger.error(SCOPE, 'insert ajustement failed', { error });
      return 0;
    }
  }

  return result.delta_ht;
}

/**
 * Detecte une rupture anticipee : calcule l'avoir pro-rata + insere un
 * ajustement pending. Supprime aussi les echeances futures non facturees
 * du contrat.
 */
export async function detectRuptureAjustement(
  supabase: Client,
  contratId: string,
  dateRupture: string,
): Promise<number> {
  // contrat + billedLines en parallele : independants.
  const [contratRes, billedLines] = await Promise.all([
    supabase
      .from('contrats')
      .select('id, projet_id, date_debut, duree_mois')
      .eq('id', contratId)
      .maybeSingle(),
    loadBilledLines(supabase, contratId),
  ]);

  const { data: contrat, error: contratErr } = contratRes;
  if (contratErr || !contrat) return 0;
  if (!contrat.date_debut || !contrat.duree_mois) return 0;

  // 1. Calcule l'avoir pro-rata sur factures emises
  let deltaHt = 0;
  let detail: Json = {} as unknown as Json;
  if (billedLines.length > 0) {
    const result = computeProrataRupture(
      { date_debut: contrat.date_debut, duree_mois: contrat.duree_mois },
      dateRupture,
      billedLines,
    );
    // Avoir : delta_ht negatif (SOLUVIA doit rendre)
    deltaHt = -result.avoir_total_ht;
    detail = {
      date_rupture: dateRupture,
      avoir_total_ht: result.avoir_total_ht,
      breakdown: result.breakdown,
    } as unknown as Json;
  }

  // 2. Les echeances futures du projet seront naturellement recomputees
  //    au prochain run du cron (le contrat archive/resilie ne contribuera
  //    plus a aggregateProjetEcheances).

  // 3. Si delta != 0, insere/update l'ajustement
  if (Math.abs(deltaHt) < 0.01) return 0;

  const { data: existing } = await supabase
    .from('facturation_ajustements_pending')
    .select('id')
    .eq('contrat_id', contratId)
    .eq('type', 'rupture')
    .is('resolved_at', null)
    .maybeSingle();

  const motif = `Rupture anticipee au ${dateRupture} -> avoir de ${Math.abs(deltaHt).toFixed(2)} EUR HT`;

  if (existing?.id) {
    const { error } = await supabase
      .from('facturation_ajustements_pending')
      .update({ delta_ht: deltaHt, detail, motif })
      .eq('id', existing.id);
    if (error) {
      logger.error(SCOPE, 'update rupture ajustement failed', { error });
      return 0;
    }
  } else {
    const { error } = await supabase
      .from('facturation_ajustements_pending')
      .insert({
        projet_id: contrat.projet_id,
        contrat_id: contratId,
        type: 'rupture',
        delta_ht: deltaHt,
        detail,
        motif,
      });
    if (error) {
      logger.error(SCOPE, 'insert rupture ajustement failed', { error });
      return 0;
    }
  }

  return deltaHt;
}
