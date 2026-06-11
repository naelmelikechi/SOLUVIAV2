import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { classifyLineType } from '@/lib/eduvia/line-types';
import { getActiveOpcoMapping } from '@/lib/queries/opcos';
import { resolveOpcoFromIdcc, normalizeIdcc } from '@/lib/opco/resolve';

// ---------------------------------------------------------------------------
// Billable events : 2 sources de facturation pour tous les projets avec
// contrats Eduvia (commission sur engagement OU sur reglement OPCO,
// jamais les deux pour un meme contrat).
//
// Type 'engagement'   : 1 event par contrat dont contract_state='ENGAGE',
//                       source_id = contrats.id,
//                       montant_brut = SUM(eduvia_invoice_lines.amount
//                                         WHERE line_type='PEDAGOGIE'
//                                         AND step_number=1)
//                       Base PEDAGOGIE uniquement (PREMIEREQUIPEMENT/matériel
//                       exclu) : ~108 561,76 EUR sur HEOL — proche de la métrique
//                       "engagés" Eduvia, qui elle inclut le matériel.
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

  invoice_state: string | null; // etat facture Eduvia (TRANSMIS/REGLE), miroir de eduvia_invoice_steps

  opco_code: string | null; // OPCO resolu via IDCC employeur, null si non resolu
  opco_nom: string | null; // Nom affiche dans UI/PDF

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
   * - 'missing_idcc'       : l'IDCC (convention collective) de l'employeur est
   *                          absent/invalide -> OPCO non resoluble, facturation
   *                          bloquee pour eviter une imputation incorrecte
   * - 'unknown_line_type'  : une ligne du bordereau OPCO du contrat a un
   *                          line_type ni whiteliste ni blackliste. Voir
   *                          unknown_line_types pour la liste, et
   *                          lib/eduvia/line-types.ts pour la classification.
   * - 'unknown_opco'       : IDCC de l'employeur present mais rattache a aucun
   *                          OPCO actif du referentiel. Facturation bloquee
   *                          pour eviter une imputation incorrecte.
   */
  lock_reason?:
    | 'opposite_billed'
    | 'missing_idcc'
    | 'unknown_line_type'
    | 'unknown_opco';
  unknown_line_types?: string[];
}

/**
 * Métadonnées contrat pour la vue "reste à facturer" : couvre TOUS les
 * contrats non archivés du projet, y compris ceux sans event émis (utile
 * pour le prévisionnel basé sur le NPEC contractuel).
 */
export interface ContratMeta {
  contrat_id: string;
  contrat_ref: string | null;
  contract_number: string | null;
  internal_number: string | null;
  apprenant_nom: string;
  apprenant_prenom: string;
  formation_titre: string | null;
  contract_state: string;
  npec_amount: number;
  /** Base PEDAGOGIE commissionnable (Eduvia `support`) ; npec inclut le
   *  materiel/RQTH non commissionne. null -> fallback npec au previsionnel. */
  support: number | null;
  opco_code: string | null;
  opco_nom: string | null;
  /** Base PEDAGOGIE emise mais NON encore payee (steps TRANSMIS). Sert au
   *  bucket "en attente de paiement" (commission = base x taux). */
  pedago_emis_non_paye: number;
}

export interface ProjetBillableEvents {
  projetId: string;
  projetRef: string;
  clientRaisonSociale: string;
  tauxCommission: number;
  events: BillableEvent[];
  /**
   * Map `event.source_id` -> liste des `eduvia_invoice_id` ayant contribue
   * a `montant_brut` pour cet event. Utilise UNIQUEMENT par l'audit log
   * a la facturation (createFactureFromEvents). Non destine a l'UI.
   */
  auditInvoiceIdsBySource: Map<string, number[]>;
  /**
   * Régime TVA du client (n° TVA intracom), pour dériver le HT depuis le
   * montant_commissionne (TTC). null => TVA 20 % (cas domestique standard).
   */
  clientTvaIntracom: string | null;
  /**
   * TOUS les contrats non archivés du projet (event-less inclus). Base du
   * prévisionnel "reste à facturer". Voir lib/utils/reste-a-facturer.ts.
   */
  contrats: ContratMeta[];
}

/**
 * Determines the billing status of an event based on its billing and lock state.
 * Priority: billed > missing_idcc > unknown_opco > unknown_line_type > opposite_billed > available.
 */
function resolveLock(opts: {
  billed?: BilledRef;
  lockedByOther?: BilledRef;
  missingIdcc: boolean;
  unknownOpco: boolean;
  hasUnknown: boolean;
}): {
  status: BillableEvent['status'];
  lock_reason?: BillableEvent['lock_reason'];
} {
  if (opts.billed) return { status: 'billed' };
  if (opts.missingIdcc)
    return { status: 'locked', lock_reason: 'missing_idcc' };
  if (opts.unknownOpco)
    return { status: 'locked', lock_reason: 'unknown_opco' };
  if (opts.hasUnknown)
    return { status: 'locked', lock_reason: 'unknown_line_type' };
  if (opts.lockedByOther)
    return { status: 'locked', lock_reason: 'opposite_billed' };
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
      client:clients!projets_client_id_fkey(id, raison_sociale, tva_intracommunautaire)
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
      contract_state, npec_amount, support, eduvia_company_id
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
      auditInvoiceIdsBySource: new Map(),
      clientTvaIntracom: projet.client?.tva_intracommunautaire ?? null,
      contrats: [],
    };
  }

  const contratIds = contrats.map((c) => c.id);

  // 2b. Mapping OPCO actifs (IDCC -> OPCO info) + IDCC employeur par company.
  // 3. Lignes des bordereaux OPCO emis pour ces contrats.
  //    Source de verite : eduvia_invoice_lines (whitelist line_type=PEDAGOGIE).
  //    On joint avec eduvia_invoice_steps pour matcher l'invoice_id au
  //    step_number (1 = engagement, >1 = opco_step regle).
  // 4. Steps emis (pour savoir quels invoice_id sont en step 1 OPCO).
  //    NB: on selectionne aussi `id` (UUID PK) car il sert de event_source_id
  //    pour les events opco_step (cle d'idempotence facture_lignes).
  const [
    opcoMapping,
    { data: invoiceLines },
    { data: emittedSteps },
    { data: companiesIdcc },
  ] = await Promise.all([
    getActiveOpcoMapping(),
    supabase
      .from('eduvia_invoice_lines')
      .select('eduvia_invoice_id, contrat_id, amount, line_type')
      .in('contrat_id', contratIds),
    supabase
      .from('eduvia_invoice_steps')
      .select(
        'id, contrat_id, step_number, eduvia_invoice_id, including_pedagogie_amount, opening_date, paid_at, invoice_state',
      )
      .in('contrat_id', contratIds)
      .not('invoice_state', 'is', null)
      .not('eduvia_invoice_id', 'is', null),
    supabase
      .from('eduvia_companies')
      .select('eduvia_id, idcc_code')
      .eq('client_id', projet.client?.id ?? ''),
  ]);

  // IDCC (convention collective) de l'employeur par company Eduvia : seul
  // determinant legal de l'OPCO (l'API Eduvia n'expose pas l'OPCO directement).
  const idccByCompanyId = new Map<number, string | null>();
  for (const co of companiesIdcc ?? []) {
    idccByCompanyId.set(co.eduvia_id, co.idcc_code);
  }

  // Index : invoice_id -> step infos (pour retrouver step_number et le step.id)
  type StepRow = NonNullable<typeof emittedSteps>[number];
  const stepByInvoiceId = new Map<number, StepRow>();
  for (const s of emittedSteps ?? []) {
    if (s.eduvia_invoice_id != null)
      stepByInvoiceId.set(s.eduvia_invoice_id, s);
  }

  // 5. Classifier les lignes par contrat. Calculer base engagement, base
  //    par step opco, et detecter les line_type inconnus.
  type ContratLignesAgg = {
    basePedagoEngagement: number;
    engagementInvoiceIds: Set<number>;
    basePedagoByStepInvoice: Map<number, number>;
    unknownLineTypes: Set<string>;
    basePedagoEmisNonPaye: number;
  };
  const aggByContrat = new Map<string, ContratLignesAgg>();
  for (const cid of contratIds) {
    aggByContrat.set(cid, {
      basePedagoEngagement: 0,
      engagementInvoiceIds: new Set(),
      basePedagoByStepInvoice: new Map(),
      unknownLineTypes: new Set(),
      basePedagoEmisNonPaye: 0,
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
    // Regle metier HEOL : on ne facture la commission que sur l'argent
    // REELLEMENT ENCAISSE. Seul un step REGLE (paye) entre dans la base
    // facturable. Un step seulement emis (TRANSMIS) est capte a part dans
    // basePedagoEmisNonPaye -> bucket "en attente de paiement OPCO".
    if (step.invoice_state !== 'REGLE') {
      agg.basePedagoEmisNonPaye += Number(line.amount);
      continue;
    }
    if (step.step_number === 1) {
      agg.basePedagoEngagement += Number(line.amount);
      agg.engagementInvoiceIds.add(line.eduvia_invoice_id);
    } else {
      const prev = agg.basePedagoByStepInvoice.get(line.eduvia_invoice_id) ?? 0;
      agg.basePedagoByStepInvoice.set(
        line.eduvia_invoice_id,
        prev + Number(line.amount),
      );
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
  const auditInvoiceIdsBySource = new Map<string, number[]>();
  const contratsMeta: ContratMeta[] = [];

  for (const c of contrats) {
    const billedTypes = eventTypesByContrat.get(c.id);
    const agg = aggByContrat.get(c.id)!;
    const hasUnknown = agg.unknownLineTypes.size > 0;
    const idcc = normalizeIdcc(idccByCompanyId.get(c.eduvia_company_id ?? -1));
    const missingIdcc = !idcc;
    const unknownTypesList = hasUnknown
      ? Array.from(agg.unknownLineTypes).sort()
      : undefined;

    const opcoInfo = resolveOpcoFromIdcc(idcc, opcoMapping);
    // unknownOpco: IDCC valide mais rattaché à aucun OPCO actif du référentiel.
    // Si l'IDCC est absent/invalide, missingIdcc s'en charge.
    const unknownOpco = !!idcc && !opcoInfo;

    contratsMeta.push({
      contrat_id: c.id,
      contrat_ref: c.ref,
      contract_number: c.contract_number,
      internal_number: c.internal_number,
      apprenant_nom: c.apprenant_nom ?? '',
      apprenant_prenom: c.apprenant_prenom ?? '',
      formation_titre: c.formation_titre,
      contract_state: c.contract_state,
      npec_amount: Number(c.npec_amount ?? 0),
      support: c.support != null ? Number(c.support) : null,
      opco_code: opcoInfo?.code ?? null,
      opco_nom: opcoInfo?.nom ?? null,
      pedago_emis_non_paye: agg.basePedagoEmisNonPaye,
    });

    // -- Event engagement --------------------------------------------------
    if (c.contract_state === 'ENGAGE' && agg.basePedagoEngagement > 0) {
      const billed = billedByEventSource.get(c.id);
      const lockedByOpco = billedTypes?.get('opco_step');
      const { status, lock_reason } = resolveLock({
        billed,
        lockedByOther: lockedByOpco,
        missingIdcc,
        unknownOpco,
        hasUnknown,
      });

      auditInvoiceIdsBySource.set(
        c.id,
        Array.from(agg.engagementInvoiceIds).sort(),
      );
      // Etat + date d'ouverture Eduvia de(s) facture(s) step 1 portant la
      // pedagogie (engagement). La facture PREMIEREQUIPEMENT (blacklist) n'y
      // figure pas car elle n'entre pas dans engagementInvoiceIds.
      const engagementSteps = Array.from(agg.engagementInvoiceIds)
        .map((id) => stepByInvoiceId.get(id))
        .filter((s): s is StepRow => !!s);
      const engagementInvoiceState =
        Array.from(
          new Set(
            engagementSteps
              .map((s) => s.invoice_state)
              .filter((s): s is string => !!s),
          ),
        )
          .sort()
          .join(' / ') || null;
      const engagementOpeningDate =
        engagementSteps
          .map((s) => s.opening_date)
          .filter((d): d is string => !!d)
          .sort()[0] ?? null;
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
        step_opening_date: engagementOpeningDate,
        step_paid_at: null,
        invoice_state: engagementInvoiceState,
        opco_code: opcoInfo?.code ?? null,
        opco_nom: opcoInfo?.nom ?? null,
        montant_brut: agg.basePedagoEngagement,
        montant_commissionne:
          Math.round(((agg.basePedagoEngagement * taux) / 100) * 100) / 100,
        status,
        billed_on: billed,
        locked_by:
          !missingIdcc && !unknownOpco && !hasUnknown
            ? lockedByOpco
            : undefined,
        lock_reason,
        unknown_line_types:
          lock_reason === 'unknown_line_type' ? unknownTypesList : undefined,
      });
    }

    // -- Events opco_step --------------------------------------------------
    for (const [invoiceId, basePedago] of agg.basePedagoByStepInvoice) {
      if (basePedago <= 0) continue;
      const step = stepByInvoiceId.get(invoiceId);
      if (!step) continue;

      const billed = billedByEventSource.get(step.id);
      const lockedByEngagement = billedTypes?.get('engagement');
      const { status, lock_reason } = resolveLock({
        billed,
        lockedByOther: lockedByEngagement,
        missingIdcc,
        unknownOpco,
        hasUnknown,
      });

      auditInvoiceIdsBySource.set(step.id, [invoiceId]);
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
        invoice_state: step.invoice_state ?? null,
        opco_code: opcoInfo?.code ?? null,
        opco_nom: opcoInfo?.nom ?? null,
        montant_brut: basePedago,
        montant_commissionne:
          Math.round(((basePedago * taux) / 100) * 100) / 100,
        status,
        billed_on: billed,
        locked_by:
          !missingIdcc && !unknownOpco && !hasUnknown
            ? lockedByEngagement
            : undefined,
        lock_reason,
        unknown_line_types:
          lock_reason === 'unknown_line_type' ? unknownTypesList : undefined,
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
    auditInvoiceIdsBySource,
    clientTvaIntracom: projet.client?.tva_intracommunautaire ?? null,
    contrats: contratsMeta,
  };
}

/**
 * Liste les projets actifs ayant au moins un contrat Eduvia non archive.
 * Utilise par le selecteur de projet dans la creation de brouillon.
 */
export async function listBillableProjets(): Promise<
  Array<{ id: string; ref: string; client_raison_sociale: string }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projets')
    .select(
      `
      id, ref,
      client:clients!projets_client_id_fkey(raison_sociale),
      contrats!contrats_projet_id_fkey(id)
    `,
    )
    .eq('archive', false)
    .order('ref');

  if (error) {
    logger.error('queries.billable-events', 'listBillableProjets failed', {
      error,
    });
    return [];
  }

  return (data ?? []).flatMap((p) =>
    (p.contrats ?? []).length > 0
      ? [
          {
            id: p.id,
            ref: p.ref ?? '',
            client_raison_sociale: p.client?.raison_sociale ?? '',
          },
        ]
      : [],
  );
}
