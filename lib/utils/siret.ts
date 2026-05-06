/**
 * Helpers de validation SIRET (14 chiffres) pour les clients SOLUVIA.
 *
 * - normalizeSiret  : strip les espaces (et caracteres blancs) pour stockage propre
 * - isValidSiretFormat : verifie le format strict 14 chiffres
 * - isValidSiretLuhn   : verifie le checksum officiel (algorithme Luhn mod 10)
 */

export function normalizeSiret(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, '');
}

export function isValidSiretFormat(siret: string): boolean {
  return /^\d{14}$/.test(siret);
}

export function isValidSiretLuhn(siret: string): boolean {
  // Algorithme Luhn pour SIRET (14 chiffres)
  if (!isValidSiretFormat(siret)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let n = Number(siret[i]);
    // En SIRET, les positions paires (1, 3, 5, ...) sont doublees
    // Index 0-based : positions 0, 2, 4, ... NON doublees ; positions 1, 3, 5, ... doublees
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}
