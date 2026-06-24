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
