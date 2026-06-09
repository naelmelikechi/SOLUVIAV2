'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { checkAuth } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import { addDaysIso } from '@/lib/utils/dates';
import { getDelaiEcheanceJours } from '@/lib/queries/parametres';
import { getBillableEvents } from '@/lib/queries/billable-events';
import { getDefaultSocieteEmettriceId } from '@/lib/queries/societes-emettrices';
import { computeFactureTotauxTtcInclus } from '@/lib/utils/facture-totaux-ttc-inclus';
import { resolveTvaRegime } from '@/lib/utils/tva-intracom';
import { uuidSchema } from '@/lib/actions/factures/brouillons-shared';

const SelectedEventSchema = z.object({
  type: z.enum(['engagement', 'opco_step']),
  source_id: uuidSchema('source_id'),
});

const CreateFactureFromEventsSchema = z.object({
  projetId: uuidSchema('projetId'),
  events: z
    .array(SelectedEventSchema)
    .min(1, 'Aucun événement sélectionné')
    .max(500, 'Trop d’événements sélectionnés'),
  opcoCodesFilter: z
    .array(z.string().regex(/^[A-Z][A-Z0-9_]*$/))
    .min(1, 'Au moins un OPCO requis si filtre fourni')
    .optional(),
});

// ---------------------------------------------------------------------------
// createFactureFromEvents - facturation manuelle event-based (mode 'manual')
// ---------------------------------------------------------------------------
// Cree un brouillon de facture (statut 'a_emettre') depuis une selection
// d'evenements facturables (engagements ou opco_steps). Une seule facture
// est produite, avec une ligne par event. Le ref final est attribue a
// l'envoi via sendFacture.
//
// Idempotence : la UNIQUE INDEX uq_facture_lignes_event_live garantit qu'un
// event ne peut etre dans deux lignes "live" en meme temps. Si un autre
// utilisateur facture le meme event en parallele, l'INSERT echoue, on
// rollback proprement.
//
// Regle d'exclusion engagement <-> opco_step : appliquee cote query
// (getBillableEvents marque le type oppose comme 'locked' si l'autre est
// deja facture). Cote action, on re-verifie en fetchant l'etat live.

export interface SelectedEvent {
  type: 'engagement' | 'opco_step';
  source_id: string;
}

export async function createFactureFromEvents(params: {
  projetId: string;
  events: SelectedEvent[];
  opcoCodesFilter?: string[];
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const parsed = CreateFactureFromEventsSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  const { projetId, events } = parsed.data;

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // 1. Recharge l'etat live des events (anti-stale UI)
  const live = await getBillableEvents(projetId);
  if (!live) {
    return { success: false, error: 'Projet introuvable' };
  }

  // 2. Index par (type, source_id) pour acces O(1)
  const liveByKey = new Map(
    live.events.map((e) => [`${e.type}::${e.source_id}`, e]),
  );

  // 3. Verifie chaque event selectionne : doit etre 'available'
  const resolved: typeof live.events = [];
  for (const sel of events) {
    const e = liveByKey.get(`${sel.type}::${sel.source_id}`);
    if (!e) {
      return {
        success: false,
        error: `Événement introuvable : ${sel.type}/${sel.source_id}`,
      };
    }
    if (e.status === 'billed') {
      return {
        success: false,
        error: `Déjà facturé sur ${e.billed_on?.facture_ref ?? 'un brouillon'} : ${e.apprenant_prenom} ${e.apprenant_nom}`,
      };
    }
    if (e.status === 'locked') {
      if (e.lock_reason === 'missing_idcc') {
        return {
          success: false,
          error: `Convention collective (IDCC) absente côté Eduvia : ${e.apprenant_prenom} ${e.apprenant_nom} (${e.contrat_ref ?? e.contrat_id}). Impossible de déterminer l'OPCO avant de facturer.`,
        };
      }
      if (e.lock_reason === 'unknown_opco') {
        return {
          success: false,
          error: `OPCO non identifié : ${e.apprenant_prenom} ${e.apprenant_nom} (${e.contrat_ref ?? e.contrat_id}). L'IDCC de l'employeur n'est rattaché à aucun OPCO ; mappez-le dans /admin/parametres/opcos.`,
        };
      }
      const opp = e.type === 'engagement' ? 'règlements OPCO' : 'engagement';
      return {
        success: false,
        error: `Verrouillé : ${e.apprenant_prenom} ${e.apprenant_nom} a déjà été facturé via ${opp} (${e.locked_by?.facture_ref ?? '-'})`,
      };
    }
    resolved.push(e);
  }

  // 3-bis. Defense en profondeur : refuse tout event dont l'OPCO n'a pas pu
  //        etre resolu via l'IDCC employeur (l UI le filtre deja mais protege
  //        contre bypass curl ou race entre sync Eduvia et creation facture).
  const unresolvedOpcoEvents = resolved.filter((e) => !e.opco_code);
  if (unresolvedOpcoEvents.length > 0) {
    const refs = unresolvedOpcoEvents
      .map((e) => e.contrat_ref ?? e.contrat_id)
      .join(', ');
    return {
      success: false,
      error: `OPCO non résolu pour : ${refs}. Vérifiez l'IDCC de l'employeur (Eduvia) et le référentiel OPCO avant de facturer.`,
    };
  }

  // Filtre OPCO (si fourni)
  const opcoCodesFilter = parsed.data.opcoCodesFilter;
  const filteredResolved = opcoCodesFilter
    ? resolved.filter(
        (e) => e.opco_code && opcoCodesFilter.includes(e.opco_code),
      )
    : resolved;

  if (filteredResolved.length === 0) {
    return {
      success: false,
      error: opcoCodesFilter
        ? `Aucun event correspondant aux OPCO selectionnes : ${opcoCodesFilter.join(', ')}`
        : 'Aucun event a facturer',
    };
  }

  // 4. Verifie l'exclusion engagement <-> opco_step DANS la selection
  //    (un meme contrat ne peut pas avoir engagement + opco_step coches en
  //    meme temps - on tient ca cote front aussi mais ceinture+bretelle).
  const typesByContrat = new Map<string, Set<string>>();
  const firstByContrat = new Map<string, (typeof resolved)[number]>();
  for (const e of resolved) {
    let s = typesByContrat.get(e.contrat_id);
    if (!s) {
      s = new Set();
      typesByContrat.set(e.contrat_id, s);
    }
    s.add(e.type);
    if (!firstByContrat.has(e.contrat_id)) firstByContrat.set(e.contrat_id, e);
  }
  for (const [cid, types] of typesByContrat) {
    if (types.has('engagement') && types.has('opco_step')) {
      const e = firstByContrat.get(cid);
      return {
        success: false,
        error: `Sélection invalide : ${e?.apprenant_prenom ?? ''} ${e?.apprenant_nom ?? ''} a un engagement ET un règlement OPCO cochés. Choisissez l'un OU l'autre.`,
      };
    }
  }

  // 5. Recupere client_id du projet + TVA intracom client (pour autoliquidation)
  const { data: projet } = await supabase
    .from('projets')
    .select(
      'id, client_id, taux_commission, client:clients!projets_client_id_fkey(tva_intracommunautaire)',
    )
    .eq('id', projetId)
    .single();
  if (!projet) return { success: false, error: 'Projet introuvable' };

  const taux = Number(projet.taux_commission ?? live.tauxCommission);

  // 6. Calcule montants
  //
  // Convention metier (HEOL) : la commission Soluvia est exprimee TTC
  // dans le contrat client.
  // Concretement : `montant_commissionne` (= base * taux/100) represente le
  // total TTC, TVA INCLUSE. On derive HT/TVA a rebours pour que la facture
  // affiche bien Total TTC = montant attendu par le client.
  //
  // La "base" depend du type d event (cf. billable-events.ts) :
  //   - 'engagement'  : SUM(eduvia_invoice_steps.total_amount) WHERE
  //                     step_number=1 AND invoice_state IS NOT NULL
  //                     (= metrique "engages" cote Eduvia)
  //   - 'opco_step'   : eduvia_invoice_steps.total_amount du step regle
  // Audit log : pour chaque event utilisé dans le calcul, comparer la base
  // (SUM lines PEDAGOGIE) au champ including_pedagogie_amount du step Eduvia.
  // Diverge attendu sur les invoices HEOL emis avant 2026-05-06 (arrondi
  // Eduvia a l'euro entier dans les lignes, fix le 2026-05-06). Sinon ecart
  // = 0. Un ecart sur un invoice recent doit declencher une investigation.
  {
    const stepInvoiceIds = Array.from(
      new Set(
        filteredResolved.flatMap(
          (e) => live.auditInvoiceIdsBySource.get(e.source_id) ?? [],
        ),
      ),
    );
    if (stepInvoiceIds.length > 0) {
      const [{ data: stepsForAudit }, { data: linesForAudit }] =
        await Promise.all([
          supabase
            .from('eduvia_invoice_steps')
            .select('eduvia_invoice_id, including_pedagogie_amount, contrat_id')
            .in('eduvia_invoice_id', stepInvoiceIds),
          supabase
            .from('eduvia_invoice_lines')
            .select('eduvia_invoice_id, amount')
            .in('eduvia_invoice_id', stepInvoiceIds)
            .eq('line_type', 'PEDAGOGIE'),
        ]);

      const linesByInvoice = new Map<number, number>();
      for (const l of linesForAudit ?? []) {
        if (l.eduvia_invoice_id == null) continue;
        linesByInvoice.set(
          l.eduvia_invoice_id,
          (linesByInvoice.get(l.eduvia_invoice_id) ?? 0) + Number(l.amount),
        );
      }
      for (const s of stepsForAudit ?? []) {
        if (s.eduvia_invoice_id == null) continue;
        const linesPedago = linesByInvoice.get(s.eduvia_invoice_id) ?? 0;
        const stepPedago = Number(s.including_pedagogie_amount ?? 0);
        const ecart = Math.round((stepPedago - linesPedago) * 100) / 100;
        if (Math.abs(ecart) > 0.01) {
          logger.info('actions.factures', 'ecart pedago lines vs step', {
            invoice_id: s.eduvia_invoice_id,
            contrat_id: s.contrat_id,
            step_pedago: stepPedago,
            lines_pedago: linesPedago,
            ecart,
          });
        }
      }
    }
  }

  const tauxTva = resolveTvaRegime(projet.client?.tva_intracommunautaire).taux;
  const { totalTtc, totalHt, montantTva, lignesHt } =
    computeFactureTotauxTtcInclus(filteredResolved, tauxTva);
  const montantTtc = totalTtc;

  if (totalTtc <= 0) {
    return { success: false, error: 'Montant total nul ou négatif' };
  }

  const dateEmissionStr = new Date().toISOString().split('T')[0]!;
  const delaiJours = await getDelaiEcheanceJours(supabase);
  const dateEcheanceStr = addDaysIso(dateEmissionStr, delaiJours);

  // 7. INSERT brouillon
  const societeEmettriceId = await getDefaultSocieteEmettriceId();
  const { data: facture, error: insertError } = await supabase
    .from('factures')
    .insert({
      societe_emettrice_id: societeEmettriceId,
      projet_id: projetId,
      client_id: projet.client_id,
      date_emission: dateEmissionStr,
      date_echeance: dateEcheanceStr,
      mois_concerne: new Date().toISOString().slice(0, 7), // YYYY-MM
      montant_ht: totalHt,
      taux_tva: tauxTva,
      montant_tva: montantTva,
      montant_ttc: montantTtc,
      statut: 'a_emettre',
      est_avoir: false,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (insertError || !facture) {
    return {
      success: false,
      error: insertError?.message ?? 'Échec de la création',
    };
  }

  // 8. INSERT lignes avec event_type + event_source_id
  //    L'index UNIQUE partial peut rejeter si race condition - on rollback.
  const lignes = filteredResolved.map((e, i) => {
    const typeLabel =
      e.type === 'engagement'
        ? 'Engagement contrat'
        : `Règlement OPCO #${e.step_number ?? '?'}`;
    // Description : courte et factuelle. L apprenant et le DECA ont leur
    // propre colonne dans le PDF, on evite la repetition.
    // Coherence : montant_commissionne est TTC (cf. note totaux ci-dessus).
    // On stocke le HT par ligne pour que SUM(facture_lignes.montant_ht) ==
    // factures.montant_ht (sinon les rapports/reconciliations cassent).
    const ligneHt = lignesHt[i]!;
    return {
      facture_id: facture.id,
      contrat_id: e.contrat_id,
      description: `Commission ${taux}% - ${typeLabel}`,
      montant_ht: ligneHt,
      mois_relatif: e.step_number ?? 0,
      quote_part: taux / 100,
      npec_snapshot: e.montant_brut,
      taux_commission_snapshot: taux,
      event_type: e.type,
      event_source_id: e.source_id,
      opco_code: e.opco_code,
    };
  });

  const { error: lignesError } = await supabase
    .from('facture_lignes')
    .insert(lignes);

  if (lignesError) {
    // Race condition (UNIQUE viole) ou autre : on supprime le brouillon
    await supabase.from('factures').delete().eq('id', facture.id);
    logger.error('actions.factures', 'createFactureFromEvents lignes failed', {
      factureId: facture.id,
      error: lignesError,
    });
    // Detection race condition
    if (lignesError.code === '23505') {
      return {
        success: false,
        error:
          'Un événement a été facturé en parallèle par un autre utilisateur. Recharger la page et réessayer.',
      };
    }
    return { success: false, error: lignesError.message };
  }

  logAudit(
    'manual_brouillon_created',
    'facture',
    facture.id,
    {
      eventCount: filteredResolved.length,
      montantHt: totalHt,
      types: Array.from(new Set(filteredResolved.map((e) => e.type))),
    },
    user.id,
  );

  revalidatePath('/facturation');
  revalidatePath(`/projets/${live.projetRef}`);

  return { success: true, id: facture.id };
}
