import { classifyLineType } from '@/lib/eduvia/line-types';
import { resolveOpcoFromIdcc, normalizeIdcc } from '@/lib/opco/resolve';
import type { getActiveOpcoMapping } from '@/lib/queries/opcos';
import type {
  ProjetRow,
  ContratRow,
  InvoiceLineRow,
  EmittedStepRow,
  CompanyIdccRow,
  ExistingLigneRow,
} from './db';
import type {
  EventType,
  BilledRef,
  BillableEvent,
  ContratMeta,
  ProjetBillableEvents,
} from './types';

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
// Assemblage PUR (aucune DB) des donnees deja chargees d'UN projet en events
// facturables. Source de verite unique de la logique de facturation (base
// PEDAGOGIE, idempotence, exclusion engagement<->opco_step, resolution OPCO),
// partagee par la version single et la version batch.
// ---------------------------------------------------------------------------

export function assembleProjetBillableEvents(input: {
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

export function groupByProjet<T extends { contrat_id: string | null }>(
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
