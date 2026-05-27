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
 * Lit les facture_lignes "jalon-aware" (echeancier-driven) pour le calcul de
 * derivance par jalon. UN SEUL modele de facturation s'applique : NPEC × taux
 * × quote_part avec quote_part = fraction d'un jalon (ex 1/12).
 *
 * Exclusions :
 *  - lignes d'avoirs (est_avoir=true) : comptees separement via loadAvoirsCredit.
 *  - lignes engagement/opco_step (event_type IS NOT NULL) : modele HEOL ou
 *    similaire base sur l'encaissement OPCO reel, pas sur NPEC contractuel.
 *    Pour ces lignes : npec_snapshot=montant_brut event, quote_part=taux/100
 *    (artificiel), donc la formule NPEC × taux × qp ne reconstitue PAS
 *    montant_ht. Ne PAS les inclure dans le delta NPEC.
 *  - lignes hors jalon (mois_relatif <= 0 ou quote_part <= 0) : lignes libres/
 *    manuelles qui ne participent pas a la formule.
 */
async function loadBilledLines(
  supabase: Client,
  contratId: string,
): Promise<BilledLine[]> {
  const { data, error } = await supabase
    .from('facture_lignes')
    .select(
      'montant_ht, npec_snapshot, taux_commission_snapshot, quote_part, mois_relatif, event_type, factures!inner(id, ref, est_avoir)',
    )
    .eq('contrat_id', contratId)
    .is('event_type', null)
    .not('npec_snapshot', 'is', null)
    .gt('quote_part', 0)
    .gt('mois_relatif', 0);
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
      row.quote_part == null ||
      row.mois_relatif == null
    ) {
      continue;
    }
    lines.push({
      facture_id: f.id,
      facture_ref: f.ref ?? f.id,
      mois_relatif: Number(row.mois_relatif),
      montant_ht: Number(row.montant_ht),
      npec_snapshot: Number(row.npec_snapshot),
      taux_commission_snapshot: Number(row.taux_commission_snapshot),
      quote_part: Number(row.quote_part),
    });
  }
  return lines;
}

/**
 * Somme des avoirs deja emis sur le contrat (montant_ht negatif).
 * Sert a la detection NPEC pour ne pas re-proposer un avoir deja compense.
 *
 * On compte tous les avoirs (statut quelconque) : un avoir en brouillon mais
 * destine a ce contrat est un engagement, mieux vaut prudent (sous-estime le
 * delta a emettre plutot que sur-credite).
 */
async function loadAvoirsCredit(
  supabase: Client,
  contratId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('facture_lignes')
    .select('montant_ht, factures!inner(est_avoir)')
    .eq('contrat_id', contratId);
  if (error) {
    logger.error(SCOPE, 'load avoirs credit failed', { error, contratId });
    return 0;
  }
  let total = 0;
  for (const row of data ?? []) {
    const f = row.factures as { est_avoir: boolean } | null;
    if (!f?.est_avoir) continue;
    if (row.montant_ht == null) continue;
    total += Number(row.montant_ht);
  }
  return total;
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
  // contrat + billedLines + creditsAvoirs en parallele : tous dependent juste
  // de contratId. Si contrat fail, on a paye les autres queries pour rien
  // (cas rare).
  const [contratRes, billedLines, creditsExisting] = await Promise.all([
    supabase
      .from('contrats')
      .select('id, projet_id, projets!inner(taux_commission)')
      .eq('id', contratId)
      .maybeSingle(),
    loadBilledLines(supabase, contratId),
    loadAvoirsCredit(supabase, contratId),
  ]);

  const { data: contrat, error: contratErr } = contratRes;
  if (contratErr || !contrat) return 0;

  const projet = contrat.projets as { taux_commission: number | null } | null;
  const tauxActuel = Number(projet?.taux_commission ?? 0);
  if (tauxActuel <= 0) return 0;

  if (billedLines.length === 0) return 0;

  const result = computeDerivance(
    npecActuel,
    tauxActuel,
    billedLines,
    creditsExisting,
  );
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

  // Audit trail : trace le dernier ajustement resolu pour ce contrat+type.
  // Permet a la lecture du detail de reconstituer l'historique sans avoir a
  // joindre la table elle-meme.
  const { data: lastResolved } = await supabase
    .from('facturation_ajustements_pending')
    .select('id, delta_ht, resolved_action, resolved_facture_id, resolved_at')
    .eq('contrat_id', contratId)
    .eq('type', 'npec_change')
    .not('resolved_at', 'is', null)
    .order('resolved_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const detail = {
    npec_actuel: npecActuel,
    taux_commission: tauxActuel,
    delta_ht_brut: result.delta_ht_brut,
    credits_existing: result.credits_existing,
    breakdown: result.breakdown,
    previous_resolved: lastResolved
      ? {
          id: lastResolved.id,
          delta_ht: Number(lastResolved.delta_ht),
          resolved_action: lastResolved.resolved_action,
          resolved_facture_id: lastResolved.resolved_facture_id,
          resolved_at: lastResolved.resolved_at,
        }
      : null,
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
  // contrat + billedLines + creditsAvoirs en parallele : tous independants.
  const [contratRes, billedLines, creditsExisting] = await Promise.all([
    supabase
      .from('contrats')
      .select('id, projet_id, date_debut, duree_mois')
      .eq('id', contratId)
      .maybeSingle(),
    loadBilledLines(supabase, contratId),
    loadAvoirsCredit(supabase, contratId),
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
    // Avoir BRUT : delta_ht negatif (SOLUVIA doit rendre)
    const avoirBrut = -result.avoir_total_ht;
    // Net : retire les avoirs deja emis. creditsExisting negatif -> ajoute en
    // valeur (ex: brut -600, deja rendu -200 => reste a rendre -400).
    const avoirNet = Math.round((avoirBrut - creditsExisting) * 100) / 100;
    deltaHt = avoirNet;
    detail = {
      date_rupture: dateRupture,
      avoir_total_ht: result.avoir_total_ht,
      avoir_total_ht_net: Math.abs(avoirNet),
      credits_existing: Math.round(creditsExisting * 100) / 100,
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

  // Audit trail : dernier ajustement rupture resolu pour ce contrat
  const { data: lastResolved } = await supabase
    .from('facturation_ajustements_pending')
    .select('id, delta_ht, resolved_action, resolved_facture_id, resolved_at')
    .eq('contrat_id', contratId)
    .eq('type', 'rupture')
    .not('resolved_at', 'is', null)
    .order('resolved_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastResolved) {
    detail = {
      ...(detail as object),
      previous_resolved: {
        id: lastResolved.id,
        delta_ht: Number(lastResolved.delta_ht),
        resolved_action: lastResolved.resolved_action,
        resolved_facture_id: lastResolved.resolved_facture_id,
        resolved_at: lastResolved.resolved_at,
      },
    } as unknown as Json;
  }

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
