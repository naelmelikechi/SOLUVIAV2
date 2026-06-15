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

  // Traçabilité Eduvia : réf bordereau OPCO (external_number) + n° facture
  // Eduvia (invoice_number), miroir de eduvia_invoice_steps (sync /invoices).
  external_number: string | null;
  invoice_number: string | null;

  // Reglement OPCO du bordereau (Eduvia) : montant deja regle par l'OPCO
  // (opco_settled_amount) et total facture (net_invoiced_amount = pedago +
  // premier equipement). opco_settled_amount < net_invoiced_amount => regle
  // partiel (typiquement pedago regle, premier equipement en attente).
  opco_settled_amount: number | null;
  net_invoiced_amount: number | null;

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
    | 'unknown_opco'
    | 'verrouille_manuel';
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
  manualLock: boolean;
}): {
  status: BillableEvent['status'];
  lock_reason?: BillableEvent['lock_reason'];
} {
  if (opts.billed) return { status: 'billed' };
  if (opts.manualLock)
    return { status: 'locked', lock_reason: 'verrouille_manuel' };
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

// ---------------------------------------------------------------------------
// Acces DB : helpers typed reutilises par getBillableEvents (1 projet) ET
// getBillableEventsForProjets (N projets en bulk). Filtrent tous par liste
// d'ids -> nombre de round-trips CONSTANT quel que soit le nombre de projets.
// ---------------------------------------------------------------------------

type BillableDbClient = Awaited<ReturnType<typeof createClient>>;

function qProjetOne(supabase: BillableDbClient, projetId: string) {
  return supabase
    .from('projets')
    .select(
      `
      id, ref, taux_commission,
      client:clients!projets_client_id_fkey(id, raison_sociale, tva_intracommunautaire)
    `,
    )
    .eq('id', projetId)
    .maybeSingle();
}

function qProjetsMany(supabase: BillableDbClient, projetIds: string[]) {
  return supabase
    .from('projets')
    .select(
      `
      id, ref, taux_commission,
      client:clients!projets_client_id_fkey(id, raison_sociale, tva_intracommunautaire)
    `,
    )
    .in('id', projetIds);
}

function qContrats(supabase: BillableDbClient, projetIds: string[]) {
  return supabase
    .from('contrats')
    .select(
      `
      id, projet_id, ref, contract_number, internal_number,
      apprenant_nom, apprenant_prenom, formation_titre,
      contract_state, npec_amount, support, eduvia_company_id, facturation_verrouillee
    `,
    )
    .in('projet_id', projetIds)
    .eq('archive', false);
}

function qInvoiceLines(supabase: BillableDbClient, contratIds: string[]) {
  return supabase
    .from('eduvia_invoice_lines')
    .select('eduvia_invoice_id, contrat_id, amount, line_type')
    .in('contrat_id', contratIds);
}

function qEmittedSteps(supabase: BillableDbClient, contratIds: string[]) {
  return supabase
    .from('eduvia_invoice_steps')
    .select(
      'id, contrat_id, step_number, eduvia_invoice_id, including_pedagogie_amount, total_amount, opco_settled_amount, net_invoiced_amount, opening_date, paid_at, invoice_state, invoice_number, external_number',
    )
    .in('contrat_id', contratIds)
    .not('invoice_state', 'is', null)
    .not('eduvia_invoice_id', 'is', null);
}

function qCompaniesIdcc(supabase: BillableDbClient, clientIds: string[]) {
  return supabase
    .from('eduvia_companies')
    .select('eduvia_id, idcc_code')
    .in('client_id', clientIds);
}

function qExistingLignes(supabase: BillableDbClient, contratIds: string[]) {
  return supabase
    .from('facture_lignes')
    .select(
      `
      event_type, event_source_id, contrat_id, est_avoir,
      facture:factures!facture_lignes_facture_id_fkey(id, ref, statut)
    `,
    )
    .in('contrat_id', contratIds)
    .not('event_type', 'is', null);
}

type ProjetRow = NonNullable<
  Awaited<ReturnType<typeof qProjetsMany>>['data']
>[number];
type ContratRow = NonNullable<
  Awaited<ReturnType<typeof qContrats>>['data']
>[number];
type InvoiceLineRow = NonNullable<
  Awaited<ReturnType<typeof qInvoiceLines>>['data']
>[number];
type EmittedStepRow = NonNullable<
  Awaited<ReturnType<typeof qEmittedSteps>>['data']
>[number];
type CompanyIdccRow = NonNullable<
  Awaited<ReturnType<typeof qCompaniesIdcc>>['data']
>[number];
type ExistingLigneRow = NonNullable<
  Awaited<ReturnType<typeof qExistingLignes>>['data']
>[number];

// ---------------------------------------------------------------------------
// Assemblage PUR (aucune DB) des donnees deja chargees d'UN projet en events
// facturables. Source de verite unique de la logique de facturation (base
// PEDAGOGIE, idempotence, exclusion engagement<->opco_step, resolution OPCO),
// partagee par la version single et la version batch.
// ---------------------------------------------------------------------------

function assembleProjetBillableEvents(input: {
  projet: ProjetRow;
  contrats: ContratRow[];
  opcoMapping: Awaited<ReturnType<typeof getActiveOpcoMapping>>;
  invoiceLines: InvoiceLineRow[];
  emittedSteps: EmittedStepRow[];
  companiesIdcc: CompanyIdccRow[];
  existingLignes: ExistingLigneRow[];
}): ProjetBillableEvents {
  const {
    projet,
    contrats,
    opcoMapping,
    invoiceLines,
    emittedSteps,
    companiesIdcc,
    existingLignes,
  } = input;

  const taux = Number(projet.taux_commission ?? 10);
  const base = {
    projetId: projet.id,
    projetRef: projet.ref ?? '',
    clientRaisonSociale: projet.client?.raison_sociale ?? '',
    tauxCommission: taux,
    clientTvaIntracom: projet.client?.tva_intracommunautaire ?? null,
  };

  if (contrats.length === 0) {
    return {
      ...base,
      events: [],
      auditInvoiceIdsBySource: new Map(),
      contrats: [],
    };
  }

  const contratIds = contrats.map((c) => c.id);

  // IDCC (convention collective) de l'employeur par company Eduvia : seul
  // determinant legal de l'OPCO (l'API Eduvia n'expose pas l'OPCO directement).
  const idccByCompanyId = new Map<number, string | null>();
  for (const co of companiesIdcc) {
    idccByCompanyId.set(co.eduvia_id, co.idcc_code);
  }

  // Index : invoice_id -> step infos (pour retrouver step_number et le step.id)
  const stepByInvoiceId = new Map<number, EmittedStepRow>();
  for (const s of emittedSteps) {
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

  for (const line of invoiceLines) {
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
    // Regle metier HEOL : commission sur l'argent REELLEMENT ENCAISSE par
    // l'OPCO au titre du PEDAGOGIQUE. Un step est facturable des que l'OPCO a
    // regle l'echeance pedago (opco_settled_amount >= total_amount du step),
    // MEME si invoice_state reste 'TRANSMIS' parce que le premier equipement
    // (hors base commission HEOL) n'est pas encore regle. Fallback sur REGLE
    // pour les steps pas encore resynchronises (opco_settled_amount NULL).
    const pedagoRegle =
      step.invoice_state === 'REGLE' ||
      (step.opco_settled_amount != null &&
        step.total_amount != null &&
        Number(step.opco_settled_amount) >= Number(step.total_amount));
    if (!pedagoRegle) {
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
  type LineRef = {
    contrat_id: string | null;
    event_type: string;
    facture: { id: string; ref: string | null; statut: string };
  };
  const slotsBySource = new Map<string, { live?: LineRef; avoir?: LineRef }>();
  for (const l of existingLignes) {
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
  const eventTypesByContrat = new Map<string, Map<EventType, BilledRef>>();

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
        manualLock: c.facturation_verrouillee,
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
        .filter((s): s is EmittedStepRow => !!s);
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
      const engagementExternalNumber =
        engagementSteps
          .map((s) => s.external_number)
          .filter((x): x is string => !!x)
          .sort()[0] ?? null;
      const engagementInvoiceNumber =
        engagementSteps
          .map((s) => s.invoice_number)
          .filter((x): x is string => !!x)
          .sort()[0] ?? null;
      // Reglement OPCO agrege sur le(s) bordereau(x) pedago d'engagement :
      // montant regle vs total facture, pour le badge "X recus sur Y".
      const engagementSettled = engagementSteps.some(
        (s) => s.opco_settled_amount != null,
      )
        ? engagementSteps.reduce(
            (sum, s) => sum + Number(s.opco_settled_amount ?? 0),
            0,
          )
        : null;
      const engagementNetInvoiced = engagementSteps.some(
        (s) => s.net_invoiced_amount != null,
      )
        ? engagementSteps.reduce(
            (sum, s) => sum + Number(s.net_invoiced_amount ?? 0),
            0,
          )
        : null;
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
        external_number: engagementExternalNumber,
        invoice_number: engagementInvoiceNumber,
        opco_settled_amount: engagementSettled,
        net_invoiced_amount: engagementNetInvoiced,
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
        manualLock: c.facturation_verrouillee,
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
        external_number: step.external_number ?? null,
        invoice_number: step.invoice_number ?? null,
        opco_settled_amount: step.opco_settled_amount ?? null,
        net_invoiced_amount: step.net_invoiced_amount ?? null,
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
    ...base,
    events,
    auditInvoiceIdsBySource,
    contrats: contratsMeta,
  };
}

/**
 * Materialise tous les events facturables d'UN projet, avec leur statut
 * billed/locked/available. ~7 round-trips DB.
 */
export async function getBillableEvents(
  projetId: string,
): Promise<ProjetBillableEvents | null> {
  const supabase = await createClient();

  const { data: projet, error: pErr } = await qProjetOne(supabase, projetId);
  if (pErr || !projet) {
    logger.error('queries.billable-events', 'projet not found', {
      projetId,
      error: pErr,
    });
    return null;
  }

  const { data: contrats } = await qContrats(supabase, [projetId]);
  if (!contrats || contrats.length === 0) {
    return {
      projetId,
      projetRef: projet.ref ?? '',
      clientRaisonSociale: projet.client?.raison_sociale ?? '',
      tauxCommission: Number(projet.taux_commission ?? 10),
      events: [],
      auditInvoiceIdsBySource: new Map(),
      clientTvaIntracom: projet.client?.tva_intracommunautaire ?? null,
      contrats: [],
    };
  }

  const contratIds = contrats.map((c) => c.id);

  const [
    opcoMapping,
    { data: invoiceLines },
    { data: emittedSteps },
    { data: companiesIdcc },
  ] = await Promise.all([
    getActiveOpcoMapping(),
    qInvoiceLines(supabase, contratIds),
    qEmittedSteps(supabase, contratIds),
    qCompaniesIdcc(supabase, projet.client?.id ? [projet.client.id] : []),
  ]);

  const { data: existingLignes } = await qExistingLignes(supabase, contratIds);

  return assembleProjetBillableEvents({
    projet,
    contrats,
    opcoMapping,
    invoiceLines: invoiceLines ?? [],
    emittedSteps: emittedSteps ?? [],
    companiesIdcc: companiesIdcc ?? [],
    existingLignes: existingLignes ?? [],
  });
}

function groupByProjet<T extends { contrat_id: string | null }>(
  rows: T[],
  contratToProjet: Map<string, string>,
): Map<string, T[]> {
  const byProjet = new Map<string, T[]>();
  for (const r of rows) {
    if (!r.contrat_id) continue;
    const pid = contratToProjet.get(r.contrat_id);
    if (!pid) continue;
    const arr = byProjet.get(pid);
    if (arr) arr.push(r);
    else byProjet.set(pid, [r]);
  }
  return byProjet;
}

/**
 * Version BATCH : materialise les events de PLUSIEURS projets en un nombre
 * CONSTANT de requetes (~6) au lieu de N x ~7 round-trips avec getBillableEvents
 * en boucle. Resultats dans l'ordre des `projetIds` ; projets introuvables omis.
 */
export async function getBillableEventsForProjets(
  projetIds: string[],
): Promise<ProjetBillableEvents[]> {
  if (projetIds.length === 0) return [];
  const supabase = await createClient();

  const { data: projets, error: pErr } = await qProjetsMany(
    supabase,
    projetIds,
  );
  if (pErr || !projets || projets.length === 0) {
    if (pErr) {
      logger.error(
        'queries.billable-events',
        'getBillableEventsForProjets projets failed',
        { error: pErr },
      );
    }
    return [];
  }

  const { data: contratsData } = await qContrats(supabase, projetIds);
  const contrats = contratsData ?? [];
  const contratIds = contrats.map((c) => c.id);
  const contratToProjet = new Map<string, string>();
  for (const c of contrats) {
    if (c.projet_id) contratToProjet.set(c.id, c.projet_id);
  }
  const clientIds = Array.from(
    new Set(
      projets.map((p) => p.client?.id).filter((id): id is string => !!id),
    ),
  );

  const [
    opcoMapping,
    { data: invoiceLines },
    { data: emittedSteps },
    { data: companiesIdcc },
    { data: existingLignes },
  ] = await Promise.all([
    getActiveOpcoMapping(),
    qInvoiceLines(supabase, contratIds),
    qEmittedSteps(supabase, contratIds),
    qCompaniesIdcc(supabase, clientIds),
    qExistingLignes(supabase, contratIds),
  ]);

  const linesByProjet = groupByProjet(invoiceLines ?? [], contratToProjet);
  const stepsByProjet = groupByProjet(emittedSteps ?? [], contratToProjet);
  const existingByProjet = groupByProjet(existingLignes ?? [], contratToProjet);
  const contratsByProjet = new Map<string, ContratRow[]>();
  for (const c of contrats) {
    if (!c.projet_id) continue;
    const arr = contratsByProjet.get(c.projet_id);
    if (arr) arr.push(c);
    else contratsByProjet.set(c.projet_id, [c]);
  }

  const byProjetId = new Map<string, ProjetBillableEvents>();
  for (const projet of projets) {
    byProjetId.set(
      projet.id,
      assembleProjetBillableEvents({
        projet,
        contrats: contratsByProjet.get(projet.id) ?? [],
        opcoMapping,
        invoiceLines: linesByProjet.get(projet.id) ?? [],
        emittedSteps: stepsByProjet.get(projet.id) ?? [],
        companiesIdcc: companiesIdcc ?? [],
        existingLignes: existingByProjet.get(projet.id) ?? [],
      }),
    );
  }

  return projetIds
    .map((id) => byProjetId.get(id))
    .filter((p): p is ProjetBillableEvents => p !== undefined);
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
