// Matching pur entre une facture ouverte (Soluvia) et des lignes de releve
// bancaire entrantes NON lettrees (Odoo). Sert a detecter un encaissement arrive
// en banque mais pas encore rapproche de la facture : dans ce cas l'account.move
// reste payment_state=not_paid cote Odoo, donc la facture Soluvia reste "en
// retard" alors que l'argent est la (cas FAC-HEO-0001 / ligne bancaire #140).
//
// Critere volontairement strict (domaine financier : un faux positif erode la
// confiance) : montant identique ET reference facture retrouvee dans le libelle
// bancaire. Les banques reformattent souvent la ref ("FAC-HEO-0001" arrive en
// "FACT HEO0001"), d'ou la normalisation (majuscules, [A-Z0-9] only) + matching
// par jeton.
//
// Module pur (pas de 'use server', pas d'I/O) -> testable sans DB ni Odoo, et le
// rapprochement lui-meme reste hors de Soluvia (compta / FINANCES-WISEMANH).

export interface OpenInvoiceRef {
  /** Reference Soluvia, ex "FAC-HEO-0001". */
  ref: string;
  /** Montant TTC attendu de la facture. */
  montantTtc: number;
}

export interface CandidateBankLine {
  id: number;
  amount: number;
  payment_ref: string;
}

/** Tolerance d'egalite de montant (centime), pour absorber les arrondis. */
export const DEFAULT_AMOUNT_TOLERANCE = 0.01;

/**
 * Jeton significatif d'une reference facture : trigramme projet + sequence, sans
 * le prefixe "FAC" ni les separateurs. Ex : "FAC-HEO-0001" -> "HEO0001".
 *
 * Retourne null si le jeton fait moins de 4 caracteres (trop peu discriminant
 * pour eviter un faux positif).
 */
export function invoiceRefToken(ref: string): string | null {
  let norm = ref.toUpperCase().replace(/[^A-Z0-9]/g, ''); // "FAC-HEO-0001" -> "FACHEO0001"
  if (norm.startsWith('FAC')) norm = norm.slice(3); // -> "HEO0001"
  return norm.length >= 4 ? norm : null;
}

/**
 * Cherche, parmi `lines`, la premiere ligne bancaire non lettree qui correspond
 * a la facture : montant egal (a `amountTolerance` pres) ET jeton de reference
 * facture present dans le libelle bancaire normalise de la meme facon.
 *
 * Retourne la ligne correspondante, ou null si aucune (ou si la ref ne produit
 * pas de jeton exploitable).
 */
export function matchUnreconciledBankLine<T extends CandidateBankLine>(
  invoice: OpenInvoiceRef,
  lines: readonly T[],
  amountTolerance: number = DEFAULT_AMOUNT_TOLERANCE,
): T | null {
  const token = invoiceRefToken(invoice.ref);
  if (!token) return null;
  for (const line of lines) {
    // Comparaison en centimes entiers : les montants sont monetaires (2
    // decimales) et la soustraction flottante (34571.22 - 34571.21 = 0.01000…2)
    // ferait echouer un tolerancement direct a 0.01.
    const diffCents = Math.abs(
      Math.round(line.amount * 100) - Math.round(invoice.montantTtc * 100),
    );
    if (diffCents > Math.round(amountTolerance * 100)) continue;
    const normalizedRef = line.payment_ref
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (normalizedRef.includes(token)) return line;
  }
  return null;
}
