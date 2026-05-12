import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { classifyLineType } from '@/lib/eduvia/line-types';

// ---------------------------------------------------------------------------
// Billable events : 2 sources de facturation manuelle pour les projets en
// mode billing_mode='manual' (typiquement HEOL : commission 50% sur
// engagement OU sur reglement OPCO, jamais les deux pour un meme contrat).
//
// Type 'engagement'   : 1 event par contrat dont contract_state='ENGAGE',
//                       source_id = contrats.id,
//                       montant_brut = SUM(eduvia_invoice_lines.amount
//                                         WHERE line_type='PEDAGOGIE'
//                                         AND step_number=1)
//                       Cela correspond a la metrique "engages" cote Eduvia
//                       (verifie numeriquement : 111 564,92 EUR sur HEOL).
//                       Pas le NPEC contractuel total : on facture la commission
//                       sur le montant deja emis a l OPCO, pas sur la valeur
//                       faciale du contrat.
// Type 'opco_step'    : 1 event par step dont step_number>1 ET invoice_state
//                       non-null, montant_brut = SUM(lines PEDAGOGIE du step)
//
// L'idempotence est garantie au niveau DB par l'index UNIQUE partiel
// uq_facture_lignes_event_live qui empeche d'inserer deux fois la meme
// (event_type, event_source_id) dans facture_lignes.est_avoir=false.
//
// La regle d'exclusion engagement <-> opco_step par contrat est appliquee
// dans cette query : un contrat avec un engagement deja facture verra ses
// opco_steps marques 'locked' (et inversement).
// ---------------------------------------------------------------------------

export type EventType = 'engagement' | 'opco_step';

export type BilledRef = {
  facture_id: string;
  facture_ref: string | null;
  facture_statut: string;
};

export interface BillableEvent {
  type: EventType;
  source_id: string;
  contrat_id: string;
  contrat_ref: string | null;
  contract_number: string | null; // DECA OPCO
  internal_number: string | null;
  apprenant_nom: string;
  apprenant_prenom: string;
  formation_titre: string | null;
  contract_state: string;

  step_number: number | null; // pour opco_step
  step_opening_date: string | null; // pour opco_step
  step_paid_at: string | null;

  montant_brut: number; // SUM(PEDAGOGIE lines)
  montant_commissionne: number; // brut * taux_commission / 100

  status: 'available' | 'billed' | 'locked';
  // billed       : event deja facture (ligne live)
  // locked       : ne peut pas etre facture (cf lock_reason)
  // available    : selectionnable
  billed_on?: BilledRef;
  locked_by?: BilledRef;
  /**
   * Raison du verrouillage si status='locked'. Permet a l UI d afficher
   * le bon badge/tooltip.
   * - 'opposite_billed'    : le type oppose (engagement vs opco_step) est
   *                          deja facture pour ce contrat (regle d exclusion)
   * - 'missing_deca'       : contract_number (DECA OPCO) absent, on refuse
   *                          de facturer pour eviter le rejet client
   * - 'unknown_line_type'  : une ligne du bordereau OPCO du contrat a un
   *                          line_type ni whiteliste ni blackliste. Voir
   *                          unknown_line_types pour la liste, et
   *                          lib/eduvia/line-types.ts pour la classification.
   */
  lock_reason?: 'opposite_billed' | 'missing_deca' | 'unknown_line_type';
  unknown_line_types?: string[];
  /**
   * Liste des invoice_id Eduvia ayant contribue a `montant_brut` pour cet
   * event. Utilise par l'audit log a la facturation pour comparer la base
   * lignes PEDAGOGIE vs eduvia_invoice_steps.including_pedagogie_amount.
   * Champ technique, prefixe `_` pour signaler "interne / pas pour l'UI".
   */
  _stepInvoiceIds?: number[];
}

export interface ProjetBillableEvents {
  projetId: string;
  projetRef: string;
  clientRaisonSociale: string;
  tauxCommission: number;
  events: BillableEvent[];
}

/**
 * Determines the billing status of an event based on its billing and lock state.
 * Priority: billed > missing_deca > unknown_line_type > opposite_billed > available.
 */
function resolveLock(opts: {
  billed?: BilledRef;
  lockedByOther?: BilledRef;
  missingDeca: boolean;
  hasUnknown: boolean;
}): { status: BillableEvent['status']; lock_reason?: BillableEvent['lock_reason'] } {
  if (opts.billed) return { status: 'billed' };
  if (opts.missingDeca) return { status: 'locked', lock_reason: 'missing_deca' };
  if (opts.hasUnknown) return { status: 'locked', lock_reason: 'unknown_line_type' };
  if (opts.lockedByOther) return { status: 'locked', lock_reason: 'opposite_billed' };
  return { status: 'available' };
}

/**
 * Materialise tous les events facturables d'un projet, avec leur statut
 * billed/locked/available. Une seule passe DB grace a 4 SELECTs +
 * jointures cote app.
 */
export async function getBillableEvents(
  projetId: string,
): Promise<ProjetBillableEvents | null> {
  const supabase = await createClient();

  // 1. Projet + commission + client
  const { data: projet, error: pErr } = await supabase
    .from('projets')
    .select(
      `
      id, ref, taux_commission,
      client:clients!projets_client_id_fkey(id, raison_sociale)
    `,
    )
    .eq('id', projetId)
    .maybeSingle();

  if (pErr || !projet) {
    logger.error('queries.billable-events', 'projet not found', {
      projetId,
      error: pErr,
    });
    return null;
  }

  const taux = Number(projet.taux_commission ?? 10);

  // 2. Contrats du projet (non archives)
  const { data: contrats } = await supabase
    .from('contrats')
    .select(
      `
      id, ref, contract_number, internal_number,
      apprenant_nom, apprenant_prenom, formation_titre,
      contract_state, npec_amount
    `,
    )
    .eq('projet_id', projetId)
    .eq('archive', false);

  if (!contrats || contrats.length === 0) {
    return {
      projetId,
      projetRef: projet.ref ?? '',
      clientRaisonSociale: projet.client?.raison_sociale ?? '',
      tauxCommission: taux,
      events: [],
    };
  }

  const contratIds = contrats.map((c) => c.id);

  // 3. Lignes des bordereaux OPCO emis pour ces contrats.
  //    Source de verite : eduvia_invoice_lines (whitelist line_type=PEDAGOGIE).
  //    On joint avec eduvia_invoice_steps pour matcher l'invoice_id au
  //    step_number (1 = engagement, >1 = opco_step regle).
  const { data: invoiceLines } = await supabase
    .from('eduvia_invoice_lines')
    .select('eduvia_invoice_id, contrat_id, amount, line_type')
    .in('contrat_id', contratIds);

  // 4. Steps emis (pour savoir quels invoice_id sont en step 1 OPCO).
  //    NB: on selectionne aussi `id` (UUID PK) car il sert de event_source_id
  //    pour les events opco_step (cle d'idempotence facture_lignes).
  const { data: emittedSteps } = await supabase
    .from('eduvia_invoice_steps')
    .select('id, contrat_id, step_number, eduvia_invoice_id, including_pedagogie_amount, opening_date, paid_at, invoice_state')
    .in('contrat_id', contratIds)
    .not('invoice_state', 'is', null)
    .not('eduvia_invoice_id', 'is', null);

  // Index : invoice_id -> step infos (pour retrouver step_number et le step.id)
  type StepRow = NonNullable<typeof emittedSteps>[number];
  const stepByInvoiceId = new Map<number, StepRow>();
  for (const s of emittedSteps ?? []) {
    if (s.eduvia_invoice_id != null) stepByInvoiceId.set(s.eduvia_invoice_id, s);
  }

  // 5. Classifier les lignes par contrat. Calculer base engagement, base
  //    par step opco, et detecter les line_type inconnus.
  type ContratLignesAgg = {
    basePedagoEngagement: number;
    engagementInvoiceIds: Set<number>;
    basePedagoByStepInvoice: Map<number, number>;
    unknownLineTypes: Set<string>;
  };
  const aggByContrat = new Map<string, ContratLignesAgg>();
  for (const cid of contratIds) {
    aggByContrat.set(cid, {
      basePedagoEngagement: 0,
      engagementInvoiceIds: new Set(),
      basePedagoByStepInvoice: new Map(),
      unknownLineTypes: new Set(),
    });
  }

  for (const line of invoiceLines ?? []) {
    if (!line.contrat_id || line.eduvia_invoice_id == null) continue;
    const agg = aggByContrat.get(line.contrat_id);
    if (!agg) continue;

    const klass = classifyLineType(line.line_type);
    if (klass === 'unknown') {
      agg.unknownLineTypes.add(line.line_type);
      continue;
    }
    if (klass === 'blacklist') continue;

    // whitelist -> entre dans la base
    const step = stepByInvoiceId.get(line.eduvia_invoice_id);
    if (!step) continue;
    if (step.step_number === 1) {
      agg.basePedagoEngagement += Number(line.amount);
      agg.engagementInvoiceIds.add(line.eduvia_invoice_id);
    } else {
      const prev = agg.basePedagoByStepInvoice.get(line.eduvia_invoice_id) ?? 0;
      agg.basePedagoByStepInvoice.set(line.eduvia_invoice_id, prev + Number(line.amount));
    }
  }

  // 6. Lignes de facture deja existantes pour ces events (idempotence map).
  //
  // On recupere TOUTES les lignes (live + avoirs) puis on calcule le statut
  // effectif : un event est "billed" SSI il a une ligne live (est_avoir=false)
  // ET qu aucun avoir compensateur (meme event_source_id, est_avoir=true)
  // ne l annule. Sans cette logique, un avoir total ne libere jamais le
  // contrat pour une refacturation, alors que c est precisement son but.
  const { data: existingLignes } = await supabase
    .from('facture_lignes')
    .select(
      `
      event_type, event_source_id, contrat_id, est_avoir,
      facture:factures!facture_lignes_facture_id_fkey(id, ref, statut)
    `,
    )
    .in('contrat_id', contratIds)
    .not('event_type', 'is', null);

  // Group par event_source_id : { live: Line, avoir: Line }
  type LineRef = {
    contrat_id: string | null;
    event_type: string;
    facture: { id: string; ref: string | null; statut: string };
  };
  const slotsBySource = new Map<string, { live?: LineRef; avoir?: LineRef }>();
  for (const l of existingLignes ?? []) {
    if (!l.event_type || !l.event_source_id || !l.facture) continue;
    const slot = slotsBySource.get(l.event_source_id) ?? {};
    const ref: LineRef = {
      contrat_id: l.contrat_id,
      event_type: l.event_type,
      facture: {
        id: l.facture.id,
        ref: l.facture.ref ?? null,
        statut: l.facture.statut,
      },
    };
    if (l.est_avoir) slot.avoir = ref;
    else slot.live = ref;
    slotsBySource.set(l.event_source_id, slot);
  }

  // Index : event_source_id (clef unique) -> billed ref
  const billedByEventSource = new Map<string, BilledRef>();
  // Index : contrat_id -> set des event_type deja factures live ET non
  // annules par avoir (regle d'exclusion engagement <-> opco_step).
  const eventTypesByContrat = new Map<
    string,
    Map<EventType, BilledRef> // type -> ref pour l'affichage
  >();

  for (const [eventSourceId, { live, avoir }] of slotsBySource) {
    // Avoir compensateur sur le meme event = libere le contrat
    if (!live || avoir) continue;
    const ref: BilledRef = {
      facture_id: live.facture.id,
      facture_ref: live.facture.ref,
      facture_statut: live.facture.statut,
    };
    billedByEventSource.set(eventSourceId, ref);
    if (live.contrat_id) {
      let m = eventTypesByContrat.get(live.contrat_id);
      if (!m) {
        m = new Map();
        eventTypesByContrat.set(live.contrat_id, m);
      }
      m.set(live.event_type as EventType, ref);
    }
  }

  // 7. Construction des events
  const events: BillableEvent[] = [];

  for (const c of contrats) {
    const billedTypes = eventTypesByContrat.get(c.id);
    const agg = aggByContrat.get(c.id)!;
    const hasUnknown = agg.unknownLineTypes.size > 0;
    const missingDeca = !c.contract_number || c.contract_number.trim() === '';
    const unknownTypesList = hasUnknown
      ? Array.from(agg.unknownLineTypes).sort()
      : undefined;

    // -- Event engagement --------------------------------------------------
    if (c.contract_state === 'ENGAGE' && agg.basePedagoEngagement > 0) {
      const billed = billedByEventSource.get(c.id);
      const lockedByOpco = billedTypes?.get('opco_step');
      const { status, lock_reason } = resolveLock({ billed, lockedByOther: lockedByOpco, missingDeca, hasUnknown });

      events.push({
        type: 'engagement',
        source_id: c.id,
        contrat_id: c.id,
        contrat_ref: c.ref,
        contract_number: c.contract_number,
        internal_number: c.internal_number,
        apprenant_nom: c.apprenant_nom ?? '',
        apprenant_prenom: c.apprenant_prenom ?? '',
        formation_titre: c.formation_titre,
        contract_state: c.contract_state,
        step_number: null,
        step_opening_date: null,
        step_paid_at: null,
        montant_brut: agg.basePedagoEngagement,
        montant_commissionne: Math.round(((agg.basePedagoEngagement * taux) / 100) * 100) / 100,
        status,
        billed_on: billed,
        locked_by: !missingDeca && !hasUnknown ? lockedByOpco : undefined,
        lock_reason,
        unknown_line_types: lock_reason === 'unknown_line_type' ? unknownTypesList : undefined,
        _stepInvoiceIds: Array.from(agg.engagementInvoiceIds).sort(),
      });
    }

    // -- Events opco_step --------------------------------------------------
    for (const [invoiceId, basePedago] of agg.basePedagoByStepInvoice) {
      if (basePedago <= 0) continue;
      const step = stepByInvoiceId.get(invoiceId);
      if (!step) continue;

      const billed = billedByEventSource.get(step.id);
      const lockedByEngagement = billedTypes?.get('engagement');
      const { status, lock_reason } = resolveLock({ billed, lockedByOther: lockedByEngagement, missingDeca, hasUnknown });

      events.push({
        type: 'opco_step',
        source_id: step.id,
        contrat_id: c.id,
        contrat_ref: c.ref,
        contract_number: c.contract_number,
        internal_number: c.internal_number,
        apprenant_nom: c.apprenant_nom ?? '',
        apprenant_prenom: c.apprenant_prenom ?? '',
        formation_titre: c.formation_titre,
        contract_state: c.contract_state,
        step_number: step.step_number ?? null,
        step_opening_date: step.opening_date ?? null,
        step_paid_at: step.paid_at ?? null,
        montant_brut: basePedago,
        montant_commissionne: Math.round(((basePedago * taux) / 100) * 100) / 100,
        status,
        billed_on: billed,
        locked_by: !missingDeca && !hasUnknown ? lockedByEngagement : undefined,
        lock_reason,
        unknown_line_types: lock_reason === 'unknown_line_type' ? unknownTypesList : undefined,
        _stepInvoiceIds: [invoiceId],
      });
    }
  }

  // Tri stable : par contrat_ref puis type (engagement avant opco_step)
  events.sort((a, b) => {
    const refA = (a.contrat_ref ?? a.contract_number ?? '').localeCompare(
      b.contrat_ref ?? b.contract_number ?? '',
    );
    if (refA !== 0) return refA;
    if (a.type !== b.type) return a.type === 'engagement' ? -1 : 1;
    return (a.step_number ?? 0) - (b.step_number ?? 0);
  });

  return {
    projetId,
    projetRef: projet.ref ?? '',
    clientRaisonSociale: projet.client?.raison_sociale ?? '',
    tauxCommission: taux,
    events,
  };
}

/**
 * Liste les projets en mode billing_mode='manual' pour le selecteur de l'UI.
 */
export async function listManualProjets(): Promise<
  Array<{ id: string; ref: string; client_raison_sociale: string }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projets')
    .select(
      `
      id, ref,
      client:clients!projets_client_id_fkey(raison_sociale)
    `,
    )
    .eq('billing_mode', 'manual')
    .eq('archive', false)
    .order('ref');

  if (error) {
    logger.error('queries.billable-events', 'listManualProjets failed', {
      error,
    });
    return [];
  }

  return (data ?? []).map((p) => ({
    id: p.id,
    ref: p.ref ?? '',
    client_raison_sociale: p.client?.raison_sociale ?? '',
  }));
}
