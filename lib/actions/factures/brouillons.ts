'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import { lastDayOfNextMonthUtcISO } from '@/lib/utils/dates';
import {
  aggregateProjetEcheances,
  parseJalons,
  resolveProjetEcheancier,
  type ContratEcheancierContext,
} from '@/lib/echeancier/calc';
import { getBillableEvents } from '@/lib/queries/billable-events';

// ---------------------------------------------------------------------------
// Schemas Zod (validation cote serveur, defense en profondeur)
// ---------------------------------------------------------------------------
// Pourquoi : RLS bloque les acces non autorises mais ne contraint pas le
// type. Sans ces guards, un client peut poster montants=NaN, ids=garbage ou
// arrays de 100k items et corrompre les donnees / ouvrir un DoS.

const uuidSchema = (label: string) =>
  z.string().uuid(`${label} doit etre un UUID`);

const montantHtSchema = z
  .number()
  .finite('Montant doit etre un nombre fini')
  .gte(-10_000_000, 'Montant aberrant')
  .lte(10_000_000, 'Montant aberrant');

const CreateFacturesSchema = z
  .array(uuidSchema('echeanceId'))
  .min(1, 'Aucune échéance sélectionnée')
  .max(500, 'Trop d’échéances sélectionnées');

const DeleteBrouillonSchema = uuidSchema('factureId');

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
});

const BlankBrouillonLigneSchema = z.object({
  contratId: uuidSchema('contratId'),
  description: z.string().trim().min(1, 'Description requise').max(2000),
  montantHt: montantHtSchema,
  moisRelatif: z.number().int().gte(-120).lte(120).optional(),
  quotePart: z.number().finite().gte(0).lte(1).optional(),
  npecSnapshot: z.number().finite().gte(0).lte(10_000_000).optional(),
  tauxCommissionSnapshot: z.number().finite().gte(0).lte(100).optional(),
});

const CreateBlankBrouillonSchema = z.object({
  projetId: uuidSchema('projetId'),
  lignes: z
    .array(BlankBrouillonLigneSchema)
    .min(1, 'Au moins une ligne requise')
    .max(500, 'Trop de lignes'),
});

/**
 * Cree des factures BROUILLON (statut 'a_emettre') a partir d'echeances
 * selectionnees. Aucune ref ni email n'est genere a ce stade : il faut
 * appeler sendFacture(s) ensuite pour finaliser.
 *
 * Le statut brouillon permet a l'utilisateur de relire la facture, modifier
 * les lignes ou supprimer le brouillon sans consommer de numero gapless.
 */
export async function createFactures(
  echeanceIds: string[],
): Promise<{ success: boolean; ids: string[]; error?: string }> {
  const parsed = CreateFacturesSchema.safeParse(echeanceIds);
  if (!parsed.success) {
    return {
      success: false,
      ids: [],
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }
  echeanceIds = parsed.data;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, ids: [], error: auth.error };
  const { supabase, user } = auth;

  // 1. Fetch selected echeances with projet + client + echeancier config
  const { data: echeances, error: fetchError } = await supabase
    .from('echeances')
    .select(
      `
      id, mois_concerne, montant_prevu_ht,
      projet:projets!echeances_projet_id_fkey(
        id, ref, taux_commission, echeancier_template_id, echeancier_override,
        client:clients!projets_client_id_fkey(id, trigramme)
      )
    `,
    )
    .in('id', echeanceIds)
    .is('facture_id', null);

  if (fetchError) return { success: false, ids: [], error: fetchError.message };
  if (!echeances || echeances.length === 0) {
    return {
      success: false,
      ids: [],
      error: 'Échéances introuvables ou déjà facturées',
    };
  }

  // Templates partages : 1 fetch
  const { data: templates } = await supabase
    .from('echeanciers_templates')
    .select('id, nom, jalons, is_default')
    .eq('archive', false);

  // 2. Group echeances by projet_id
  const groups = new Map<
    string,
    {
      projetId: string;
      clientId: string;
      tauxCommission: number;
      echeancierTemplateId: string | null;
      echeancierOverride: unknown;
      moisConcernes: string[];
      echeanceIds: string[];
    }
  >();

  for (const ech of echeances) {
    const projet = ech.projet;
    if (!projet) continue;
    const projetId = projet.id;
    const existing = groups.get(projetId);
    if (existing) {
      existing.moisConcernes.push(ech.mois_concerne);
      existing.echeanceIds.push(ech.id);
    } else {
      groups.set(projetId, {
        projetId,
        clientId: projet.client?.id ?? '',
        tauxCommission: projet.taux_commission ?? 10,
        echeancierTemplateId: projet.echeancier_template_id ?? null,
        echeancierOverride: projet.echeancier_override,
        moisConcernes: [ech.mois_concerne],
        echeanceIds: [ech.id],
      });
    }
  }

  // 3. For each group, create facture + lignes
  const createdIds: string[] = [];

  for (const group of groups.values()) {
    // Fetch active contrats for this projet (avec champs necessaires au calcul)
    const { data: contratsRaw } = await supabase
      .from('contrats')
      .select(
        'id, npec_amount, date_debut, duree_mois, archive, formation_titre, apprenant_prenom, apprenant_nom',
      )
      .eq('projet_id', group.projetId)
      .eq('archive', false);

    if (!contratsRaw || contratsRaw.length === 0) continue;

    const contratsCtx: ContratEcheancierContext[] = contratsRaw
      .filter((c) => c.date_debut && c.duree_mois)
      .map((c) => ({
        contrat_id: c.id,
        npec_amount: c.npec_amount ?? 0,
        date_debut: c.date_debut!,
        duree_mois: c.duree_mois!,
        archive: c.archive ?? false,
      }));

    // Resout l'echeancier du projet et calcule les contributions par
    // contrat × mois. Filtre ensuite sur les mois selectionnes.
    const resolved = resolveProjetEcheancier(
      {
        echeancier_template_id: group.echeancierTemplateId,
        echeancier_override: group.echeancierOverride,
      },
      (templates ?? []).map((t) => ({
        id: t.id,
        nom: t.nom,
        jalons: t.jalons,
        is_default: t.is_default,
      })),
    );
    const jalons = parseJalons(resolved.jalons);
    const aggregated = aggregateProjetEcheances(
      group.projetId,
      contratsCtx,
      jalons,
      group.tauxCommission,
    );

    // Filtre sur les mois selectionnes par l'utilisateur
    const moisSet = new Set(group.moisConcernes);
    const selectedAggregated = aggregated.filter((a) =>
      moisSet.has(a.mois_concerne),
    );
    if (selectedAggregated.length === 0) continue;

    // Index contrat -> infos pour la description
    const contratInfo = new Map(
      contratsRaw.map((c) => [
        c.id,
        {
          formation: c.formation_titre ?? '',
          prenom: c.apprenant_prenom ?? '',
          nom: c.apprenant_nom ?? '',
        },
      ]),
    );

    // Construit les lignes : 1 ligne par contrat × jalon dans la facture.
    // Stocke les snapshots pour audit / recompute ulterieur.
    const lignes: Array<{
      contrat_id: string;
      description: string;
      montant_ht: number;
      mois_relatif: number;
      quote_part: number;
      npec_snapshot: number;
      taux_commission_snapshot: number;
    }> = [];
    for (const agg of selectedAggregated) {
      for (const c of agg.contributions) {
        const info = contratInfo.get(c.contrat_id);
        const moisLabel = c.mois_absolu;
        lignes.push({
          contrat_id: c.contrat_id,
          description: `Commission ${group.tauxCommission}% - ${info?.formation ?? ''} - ${info?.prenom ?? ''} ${info?.nom ?? ''} - ${moisLabel}`,
          montant_ht: c.montant_ht,
          mois_relatif: c.mois_relatif,
          quote_part: c.quote_part,
          npec_snapshot: c.npec_snapshot,
          taux_commission_snapshot: group.tauxCommission,
        });
      }
    }

    if (lignes.length === 0) continue;

    // Label mois_concerne facture
    const sortedMois = [...group.moisConcernes].sort();
    const moisLabel =
      sortedMois.length === 1
        ? sortedMois[0]!
        : `${sortedMois[0]} - ${sortedMois[sortedMois.length - 1]}`;

    const totalHt =
      Math.round(lignes.reduce((s, l) => s + l.montant_ht, 0) * 100) / 100;
    const tauxTva = 20;
    const montantTva = Math.round(totalHt * tauxTva) / 100;
    const montantTtc = Math.round((totalHt + montantTva) * 100) / 100;

    // Date echeance = end of next month (UTC strict pour ne pas dependre du
    // fuseau du runtime - voir lib/utils/dates.ts).
    const dateEcheanceStr = lastDayOfNextMonthUtcISO();

    // INSERT facture en statut 'a_emettre' (brouillon).
    // Pas de ref/numero_seq attribues a ce stade : le trigger BEFORE INSERT
    // skip car statut='a_emettre'. La numerotation gapless reste preservee
    // car un brouillon supprime ne consomme aucun numero.
    const { data: facture, error: insertError } = await supabase
      .from('factures')
      .insert({
        projet_id: group.projetId,
        client_id: group.clientId,
        date_emission: new Date().toISOString().split('T')[0]!,
        date_echeance: dateEcheanceStr,
        mois_concerne: moisLabel,
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

    if (insertError || !facture) continue;

    // INSERT facture_lignes avec snapshots
    const { error: lignesError } = await supabase.from('facture_lignes').insert(
      lignes.map((l) => ({
        facture_id: facture.id,
        contrat_id: l.contrat_id,
        description: l.description,
        montant_ht: l.montant_ht,
        mois_relatif: l.mois_relatif,
        quote_part: l.quote_part,
        npec_snapshot: l.npec_snapshot,
        taux_commission_snapshot: l.taux_commission_snapshot,
      })),
    );

    if (lignesError) {
      // Rollback : supprime le brouillon orphelin (autorise tant qu'a_emettre)
      await supabase.from('factures').delete().eq('id', facture.id);
      logger.error('actions.factures', 'createFactures lignes insert failed', {
        factureId: facture.id,
        error: lignesError,
      });
      continue;
    }

    // UPDATE echeances to link au brouillon
    await supabase
      .from('echeances')
      .update({ facture_id: facture.id, validee: true })
      .in('id', group.echeanceIds);

    createdIds.push(facture.id);

    logAudit(
      'brouillon_created',
      'facture',
      facture.id,
      { mois: moisLabel },
      user.id,
    );
  }

  revalidatePath('/facturation');

  if (createdIds.length === 0) {
    return {
      success: false,
      ids: [],
      error: 'Aucun brouillon créé - vérifiez les contrats actifs',
    };
  }

  return { success: true, ids: createdIds };
}

// ---------------------------------------------------------------------------
// deleteBrouillon - supprime un brouillon (statut a_emettre uniquement).
// ---------------------------------------------------------------------------
// Autorise car aucun ref/numero_seq n'a ete attribue : pas d'impact gapless.
// Les facture_lignes sont supprimees par CASCADE. Les echeances liees sont
// detachees (facture_id remis a NULL, validee=false).
export async function deleteBrouillon(
  factureId: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = DeleteBrouillonSchema.safeParse(factureId);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }
  factureId = parsed.data;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { data: facture, error: fetchError } = await supabase
    .from('factures')
    .select('id, statut')
    .eq('id', factureId)
    .single();

  if (fetchError || !facture) {
    return { success: false, error: 'Facture introuvable' };
  }

  if (facture.statut !== 'a_emettre') {
    return {
      success: false,
      error:
        'Seuls les brouillons peuvent être supprimés. Pour annuler une facture émise, créez un avoir.',
    };
  }

  // Detache les echeances liees (validee=false, facture_id=NULL)
  await supabase
    .from('echeances')
    .update({ facture_id: null, validee: false })
    .eq('facture_id', factureId);

  // Supprime les lignes (puis la facture). CASCADE serait plus propre mais
  // on est explicite ici pour eviter les surprises.
  await supabase.from('facture_lignes').delete().eq('facture_id', factureId);

  const { error: deleteError } = await supabase
    .from('factures')
    .delete()
    .eq('id', factureId)
    .eq('statut', 'a_emettre'); // garde-fou

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  logAudit('brouillon_deleted', 'facture', factureId, {}, user.id);
  revalidatePath('/facturation');
  return { success: true };
}

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
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const parsed = CreateFactureFromEventsSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }
  const { projetId, events } = parsed.data;

  const auth = await requireUser();
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
      const opp = e.type === 'engagement' ? 'règlements OPCO' : 'engagement';
      return {
        success: false,
        error: `Verrouillé : ${e.apprenant_prenom} ${e.apprenant_nom} a déjà été facturé via ${opp} (${e.locked_by?.facture_ref ?? '-'})`,
      };
    }
    resolved.push(e);
  }

  // 4. Verifie l'exclusion engagement <-> opco_step DANS la selection
  //    (un meme contrat ne peut pas avoir engagement + opco_step coches en
  //    meme temps - on tient ca cote front aussi mais ceinture+bretelle).
  const typesByContrat = new Map<string, Set<string>>();
  for (const e of resolved) {
    let s = typesByContrat.get(e.contrat_id);
    if (!s) {
      s = new Set();
      typesByContrat.set(e.contrat_id, s);
    }
    s.add(e.type);
  }
  for (const [cid, types] of typesByContrat) {
    if (types.has('engagement') && types.has('opco_step')) {
      const e = resolved.find((x) => x.contrat_id === cid);
      return {
        success: false,
        error: `Sélection invalide : ${e?.apprenant_prenom ?? ''} ${e?.apprenant_nom ?? ''} a un engagement ET un règlement OPCO cochés. Choisissez l'un OU l'autre.`,
      };
    }
  }

  // 5. Recupere client_id du projet
  const { data: projet } = await supabase
    .from('projets')
    .select('id, client_id, taux_commission')
    .eq('id', projetId)
    .single();
  if (!projet) return { success: false, error: 'Projet introuvable' };

  const taux = Number(projet.taux_commission ?? live.tauxCommission);

  // 6. Calcule montants
  //
  // Convention metier (mode billing_mode='manual', actuellement HEOL) :
  // la commission Soluvia est exprimee TTC dans le contrat client.
  // Concretement : `montant_commissionne` (= base * taux/100) represente le
  // total TTC, TVA INCLUSE. On derive HT/TVA a rebours pour que la facture
  // affiche bien Total TTC = montant attendu par le client.
  //
  // La "base" depend du type d event (cf. billable-events.ts) :
  //   - 'engagement'  : SUM(eduvia_invoice_steps.total_amount) WHERE
  //                     step_number=1 AND invoice_state IS NOT NULL
  //                     (= metrique "engages" cote Eduvia)
  //   - 'opco_step'   : eduvia_invoice_steps.total_amount du step regle
  const tauxTva = 20;
  const totalTtc =
    Math.round(resolved.reduce((s, e) => s + e.montant_commissionne, 0) * 100) /
    100;
  const totalHt = Math.round((totalTtc / (1 + tauxTva / 100)) * 100) / 100;
  const montantTva = Math.round((totalTtc - totalHt) * 100) / 100;
  const montantTtc = totalTtc;

  if (totalTtc <= 0) {
    return { success: false, error: 'Montant total nul ou négatif' };
  }

  const dateEcheanceStr = lastDayOfNextMonthUtcISO();

  // 7. INSERT brouillon
  const { data: facture, error: insertError } = await supabase
    .from('factures')
    .insert({
      projet_id: projetId,
      client_id: projet.client_id,
      date_emission: new Date().toISOString().split('T')[0]!,
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
  const lignes = resolved.map((e) => {
    const typeLabel =
      e.type === 'engagement'
        ? 'Engagement contrat'
        : `Règlement OPCO #${e.step_number ?? '?'}`;
    const idLabel = e.contract_number ?? e.contrat_ref ?? '-';
    const apprenant = `${e.apprenant_prenom} ${e.apprenant_nom}`.trim();
    // Coherence : montant_commissionne est TTC (cf. note totaux ci-dessus).
    // On stocke le HT par ligne pour que SUM(facture_lignes.montant_ht) ==
    // factures.montant_ht (sinon les rapports/reconciliations cassent).
    const ligneHt =
      Math.round((e.montant_commissionne / (1 + tauxTva / 100)) * 100) / 100;
    return {
      facture_id: facture.id,
      contrat_id: e.contrat_id,
      description: `Commission ${taux}% - ${typeLabel} - ${apprenant} - ${idLabel}`,
      montant_ht: ligneHt,
      mois_relatif: e.step_number ?? 0,
      quote_part: taux / 100,
      npec_snapshot: e.montant_brut,
      taux_commission_snapshot: taux,
      event_type: e.type,
      event_source_id: e.source_id,
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
      eventCount: resolved.length,
      montantHt: totalHt,
      types: Array.from(new Set(resolved.map((e) => e.type))),
    },
    user.id,
  );

  revalidatePath('/facturation');
  revalidatePath(`/projets/${live.projetRef}`);

  return { success: true, id: facture.id };
}

// ---------------------------------------------------------------------------
// createBlankBrouillon - cree un brouillon "from scratch" : l'utilisateur
// choisit un projet et N contrats (avec montant + description par contrat).
// Aucun lien echeance ni event - facture purement libre, editable ensuite.
// ---------------------------------------------------------------------------
export interface BlankBrouillonLigne {
  contratId: string;
  description: string;
  montantHt: number;
  moisRelatif?: number;
  quotePart?: number;
  npecSnapshot?: number;
  tauxCommissionSnapshot?: number;
}

export async function createBlankBrouillon(params: {
  projetId: string;
  lignes: BlankBrouillonLigne[];
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const parsed = CreateBlankBrouillonSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }
  const { projetId, lignes } = parsed.data;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { data: projet } = await supabase
    .from('projets')
    .select('id, ref, client_id, taux_commission')
    .eq('id', projetId)
    .single();
  if (!projet) return { success: false, error: 'Projet introuvable' };

  // Verifie les contrats : tous doivent appartenir au projet
  const contratIds = Array.from(new Set(lignes.map((l) => l.contratId)));
  const { data: contrats } = await supabase
    .from('contrats')
    .select('id, projet_id')
    .in('id', contratIds);
  const invalid = (contrats ?? []).filter((c) => c.projet_id !== projetId);
  if (invalid.length > 0 || (contrats ?? []).length !== contratIds.length) {
    return {
      success: false,
      error: 'Certains contrats ne correspondent pas au projet sélectionné.',
    };
  }

  const totalHt =
    Math.round(lignes.reduce((s, l) => s + Number(l.montantHt ?? 0), 0) * 100) /
    100;
  if (totalHt <= 0) {
    return { success: false, error: 'Montant total nul ou négatif' };
  }

  const tauxTva = 20;
  const montantTva = Math.round(totalHt * tauxTva) / 100;
  const montantTtc = Math.round((totalHt + montantTva) * 100) / 100;

  const today = new Date();
  const dateEmissionStr = today.toISOString().split('T')[0]!;
  const dateEcheanceStr = lastDayOfNextMonthUtcISO(today);

  const { data: facture, error: insertError } = await supabase
    .from('factures')
    .insert({
      projet_id: projetId,
      client_id: projet.client_id,
      date_emission: dateEmissionStr,
      date_echeance: dateEcheanceStr,
      mois_concerne: today.toISOString().slice(0, 7),
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
      error: insertError?.message ?? 'Échec de la création du brouillon',
    };
  }

  const tauxProjet = Number(projet.taux_commission ?? 10);
  const { error: lignesError } = await supabase.from('facture_lignes').insert(
    lignes.map((l) => ({
      facture_id: facture.id,
      contrat_id: l.contratId,
      description: l.description,
      montant_ht: l.montantHt,
      mois_relatif: l.moisRelatif ?? 0,
      quote_part: l.quotePart ?? 0,
      npec_snapshot: l.npecSnapshot ?? 0,
      taux_commission_snapshot: l.tauxCommissionSnapshot ?? tauxProjet,
    })),
  );

  if (lignesError) {
    await supabase.from('factures').delete().eq('id', facture.id);
    logger.error('actions.factures', 'createBlankBrouillon lignes failed', {
      factureId: facture.id,
      error: lignesError,
    });
    return { success: false, error: lignesError.message };
  }

  logAudit(
    'blank_brouillon_created',
    'facture',
    facture.id,
    {
      projetId,
      lignesCount: lignes.length,
      montantHt: totalHt,
    },
    user.id,
  );

  revalidatePath('/facturation');
  revalidatePath(`/projets/${projet.ref}`);

  return { success: true, id: facture.id };
}
