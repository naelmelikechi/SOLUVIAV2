// Construction PURE des valeurs d'un `account.reconcile.model` Odoo « par client ».
//
// Modele cible (cf. modele id 7 fait main « Match HEOL ACADEMY » qui, lui,
// fonctionne) : pour un client donne, on reconnait ses encaissements au libelle
// bancaire (`match_label: contains <raison_sociale>`), on rattache le partenaire
// (`mapped_partner_id`), on scope au journal BANQUE de la societe emettrice, et
// `trigger` vaut 'auto_reconcile' (lettrage sans clic, Odoo choisit la facture
// ouverte du partenaire par le montant) ou 'manual' (suggestion validee par la
// compta — defaut sur).
//
// Pourquoi par client et pas par n° de facture : la banque reformate la ref
// ("FAC-HEO-0001" arrive en "FACT HEO0001"), donc le matching par numero est
// fragile ; le nom du client, lui, est present et stable dans le libelle.
//
// Module pur (pas d'I/O) -> testable sans Odoo. La resolution du partenaire et
// du journal banque (qui necessitent des lectures Odoo) vit dans le script.

export interface ClientReconcileModelInput {
  /** Raison sociale du client, telle qu'elle apparait dans le libelle bancaire. */
  raisonSociale: string;
  /** Id du res.partner Odoo du client. */
  partnerId: number;
  /** Id de la res.company Odoo de la societe emettrice. */
  companyId: number;
  /** Id du journal BANQUE (account.journal type=bank) de cette societe. */
  bankJournalId: number;
  /** true -> trigger 'auto_reconcile' (lettrage automatique), false -> 'manual'. */
  auto: boolean;
}

/**
 * Valeurs `account.reconcile.model` pretes pour create/write Odoo.
 * `match_journal_ids` utilise la commande x2many standard (6, 0, ids) = remplace.
 */
export interface ReconcileModelVals {
  name: string;
  trigger: 'manual' | 'auto_reconcile';
  match_label: 'contains';
  match_label_param: string;
  mapped_partner_id: number;
  company_id: number;
  match_journal_ids: [number, number, number[]][];
}

/** Nom (= cle d'idempotence) d'un modele auto-match pour un client. */
const NAME_PREFIX = 'Soluvia auto-match ';

export function buildClientReconcileModelVals(
  input: ClientReconcileModelInput,
): ReconcileModelVals {
  return {
    name: `${NAME_PREFIX}${input.raisonSociale}`,
    trigger: input.auto ? 'auto_reconcile' : 'manual',
    match_label: 'contains',
    match_label_param: input.raisonSociale,
    mapped_partner_id: input.partnerId,
    company_id: input.companyId,
    match_journal_ids: [[6, 0, [input.bankJournalId]]],
  };
}
