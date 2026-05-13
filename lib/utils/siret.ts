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
  // Algorithme Luhn pour SIRET (14 chiffres).
  // Contrairement au SIREN (9 chiffres), le SIRET ayant une longueur paire,
  // ce sont les chiffres d'index pair (0, 2, 4, ..., 12) qui sont doubles.
  if (!isValidSiretFormat(siret)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let n = Number(siret[i]);
    if (i % 2 === 0) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}
