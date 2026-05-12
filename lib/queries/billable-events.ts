import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Billable events : 2 sources de facturation manuelle pour les projets en
// mode billing_mode='manual' (typiquement HEOL : commission 50% sur
// engagement OU sur reglement OPCO, jamais les deux pour un meme contrat).
//
// Type 'engagement'   : 1 event par contrat dont contract_state='ENGAGE',
//                       source_id = contrats.id,
//                       montant_brut = SUM(eduvia_invoice_steps.total_amount)
//                       WHERE step_number=1 AND invoice_state IS NOT NULL.
//                       Cela correspond a la metrique "engages" cote Eduvia
//                       (verifie numeriquement : 111 564,92 EUR sur HEOL).
//                       Pas le NPEC contractuel total : on facture la commission
//                       sur le montant deja emis a l OPCO, pas sur la valeur
//                       faciale du contrat.
// Type 'opco_step'    : 1 event par step dont invoice_state='REGLE',
//                       source_id = eduvia_invoice_steps.id (UUID PK
//                       cote SOLUVIA), montant_brut = total_amount
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

  montant_brut: number; // npec ou total_amount
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
}

export interface ProjetBillableEvents {
  projetId: string;
  projetRef: string;
  clientRaisonSociale: string;
  tauxCommission: number;
  events: BillableEvent[];
}

/**
 * Materialise tous les events facturables d'un projet, avec leur statut
 * billed/locked/available. Une seule passe DB grace a 3 SELECTs paralleles +
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

  // 3. Tous les opco_steps REGLE (ou paid_at) pour ces contrats
  const { data: opcoSteps } = await supabase
    .from('eduvia_invoice_steps')
    .select(
      'id, contrat_id, step_number, opening_date, total_amount, paid_at, invoice_state',
    )
    .in('contrat_id', contratIds)
    .or('invoice_state.eq.REGLE,paid_at.not.is.null');

  // 3-bis. Base de la commission "engagement" par contrat : somme des
  // step_number=1 ayant un invoice_state (TRANSMIS ou REGLE = bordereau emis
  // a l OPCO). Certains contrats ont plusieurs entrees step 1 (ancien step
  // sans invoice_state + nouveau apres modification du contrat) : on ne
  // somme QUE celles emises pour matcher la metrique Eduvia.
  const { data: step1Rows } = await supabase
    .from('eduvia_invoice_steps')
    .select('contrat_id, total_amount, invoice_state')
    .in('contrat_id', contratIds)
    .eq('step_number', 1)
    .not('invoice_state', 'is', null);

  const engagementBaseByContrat = new Map<string, number>();
  for (const r of step1Rows ?? []) {
    if (!r.contrat_id) continue;
    engagementBaseByContrat.set(
      r.contrat_id,
      (engagementBaseByContrat.get(r.contrat_id) ?? 0) +
        Number(r.total_amount ?? 0),
    );
  }

  // 4. Lignes de facture deja existantes pour ces events (idempotence map).
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

  // 5. Construction des events
  const events: BillableEvent[] = [];

  for (const c of contrats) {
    const billedTypes = eventTypesByContrat.get(c.id);

    // DECA OPCO absent = on bloque la facturation (client refuserait)
    const missingDeca = !c.contract_number || c.contract_number.trim() === '';

    // -- Event engagement -----------------------------------------------
    // Base : montant emis cote OPCO (step 1 avec invoice_state non-null),
    // pas le NPEC contractuel total. Si pas de step 1 emis, brut = 0 et on
    // skip l event (pas d engagement a facturer cote Soluvia tant que
    // l OPCO n a pas recu le bordereau).
    const brut = engagementBaseByContrat.get(c.id) ?? 0;
    if (c.contract_state === 'ENGAGE' && brut > 0) {
      const billed = billedByEventSource.get(c.id);
      const lockedByOpco = billedTypes?.get('opco_step');
      const status: BillableEvent['status'] = billed
        ? 'billed'
        : missingDeca
          ? 'locked'
          : lockedByOpco
            ? 'locked'
            : 'available';
      const lock_reason: BillableEvent['lock_reason'] | undefined =
        status === 'locked'
          ? missingDeca
            ? 'missing_deca'
            : 'opposite_billed'
          : undefined;
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
        montant_brut: brut,
        montant_commissionne: Math.round(((brut * taux) / 100) * 100) / 100,
        status,
        billed_on: billed,
        locked_by: missingDeca ? undefined : lockedByOpco,
        lock_reason,
      });
    }

    // -- Events opco_step (un par step REGLE / paid_at) -----------------
    const stepsForContrat = (opcoSteps ?? []).filter(
      (s) => s.contrat_id === c.id,
    );
    for (const s of stepsForContrat) {
      const billed = billedByEventSource.get(s.id);
      const lockedByEngagement = billedTypes?.get('engagement');
      const status: BillableEvent['status'] = billed
        ? 'billed'
        : missingDeca
          ? 'locked'
          : lockedByEngagement
            ? 'locked'
            : 'available';
      const lock_reason: BillableEvent['lock_reason'] | undefined =
        status === 'locked'
          ? missingDeca
            ? 'missing_deca'
            : 'opposite_billed'
          : undefined;
      const brutStep = Number(s.total_amount ?? 0);
      events.push({
        type: 'opco_step',
        source_id: s.id,
        contrat_id: c.id,
        contrat_ref: c.ref,
        contract_number: c.contract_number,
        internal_number: c.internal_number,
        apprenant_nom: c.apprenant_nom ?? '',
        apprenant_prenom: c.apprenant_prenom ?? '',
        formation_titre: c.formation_titre,
        contract_state: c.contract_state,
        step_number: s.step_number ?? null,
        step_opening_date: s.opening_date ?? null,
        step_paid_at: s.paid_at ?? null,
        montant_brut: brutStep,
        montant_commissionne: Math.round(((brutStep * taux) / 100) * 100) / 100,
        status,
        billed_on: billed,
        locked_by: missingDeca ? undefined : lockedByEngagement,
        lock_reason,
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
