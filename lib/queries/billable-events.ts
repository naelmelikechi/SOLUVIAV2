import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Billable events : 2 sources de facturation manuelle pour les projets en
// mode billing_mode='manual' (typiquement HEOL : commission 50% sur
// engagement OU sur reglement OPCO, jamais les deux pour un meme contrat).
//
// Type 'engagement'   : 1 event par contrat dont contract_state='ENGAGE',
//                       source_id = contrats.id, montant_brut = npec_amount
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
  // billed : event deja facture (ligne live)
  // locked : type oppose deja facture pour ce contrat (regle d'exclusion)
  billed_on?: BilledRef;
  locked_by?: BilledRef;
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

  // 4. Lignes de facture deja existantes pour ces events (idempotence map)
  //    On filtre est_avoir=false (= lignes live, donc verrouillees).
  const { data: existingLignes } = await supabase
    .from('facture_lignes')
    .select(
      `
      event_type, event_source_id, contrat_id,
      facture:factures!facture_lignes_facture_id_fkey(id, ref, statut)
    `,
    )
    .in('contrat_id', contratIds)
    .not('event_type', 'is', null)
    .eq('est_avoir', false);

  // Index : event_source_id (clef unique) -> billed ref
  const billedByEventSource = new Map<string, BilledRef>();
  // Index : contrat_id -> set des event_type deja factures live (pour la
  // regle d'exclusion engagement <-> opco_step)
  const eventTypesByContrat = new Map<
    string,
    Map<EventType, BilledRef> // type -> ref pour l'affichage
  >();

  for (const l of existingLignes ?? []) {
    if (!l.event_type || !l.event_source_id || !l.facture) continue;
    const ref: BilledRef = {
      facture_id: l.facture.id,
      facture_ref: l.facture.ref ?? null,
      facture_statut: l.facture.statut,
    };
    billedByEventSource.set(l.event_source_id, ref);
    if (l.contrat_id) {
      let m = eventTypesByContrat.get(l.contrat_id);
      if (!m) {
        m = new Map();
        eventTypesByContrat.set(l.contrat_id, m);
      }
      m.set(l.event_type as EventType, ref);
    }
  }

  // 5. Construction des events
  const events: BillableEvent[] = [];

  for (const c of contrats) {
    const billedTypes = eventTypesByContrat.get(c.id);

    // -- Event engagement -----------------------------------------------
    if (c.contract_state === 'ENGAGE' && Number(c.npec_amount ?? 0) > 0) {
      const billed = billedByEventSource.get(c.id);
      const lockedByOpco = billedTypes?.get('opco_step');
      const status: BillableEvent['status'] = billed
        ? 'billed'
        : lockedByOpco
          ? 'locked'
          : 'available';
      const brut = Number(c.npec_amount ?? 0);
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
        locked_by: lockedByOpco,
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
        : lockedByEngagement
          ? 'locked'
          : 'available';
      const brut = Number(s.total_amount ?? 0);
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
        montant_brut: brut,
        montant_commissionne: Math.round(((brut * taux) / 100) * 100) / 100,
        status,
        billed_on: billed,
        locked_by: lockedByEngagement,
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
