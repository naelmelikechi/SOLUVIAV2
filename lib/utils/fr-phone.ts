// Normalise un numero de telephone francais vers le format national espace
// "0X XX XX XX XX" — la convention d'affichage du projet (placeholders UI
// "06 12 34 56 78", lien `tel:` de equipe-grid qui strip les espaces avant
// composition).
//
// Gere les saisies heterogenes rencontrees en base :
//   compact          "0612345678"
//   espace           "06 12 34 56 78"
//   separateurs      "06.12.34.56.78" / "06-12-34-56-78"
//   international     "+33 6 12 34 56 78" / "0033612345678" / "+33 (0)6 12..."
//   sans 0 de tete   "612345678"        (mobile saisi sans le 0)
//
// Best-effort : si l'entree ne ressemble pas a un numero FR a 10 chiffres
// (numero etranger, extension, saisie libre), on renvoie la valeur trimmee
// telle quelle plutot que de la corrompre. Vide / null / undefined -> null.
export function normalizeFrPhone(
  input: string | null | undefined,
): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;

  // Retire les separateurs courants : espaces (dont insecables, via \s),
  // points, tirets, parentheses, slash.
  const cleaned = raw.replace(/[\s.\-()/]/g, '');

  // Isole la partie "abonne" (9 chiffres significatifs) en retirant le prefixe
  // d'acces : international (+33 / 0033) ou national (0 de tete).
  let subscriber: string;
  if (cleaned.startsWith('+33')) subscriber = cleaned.slice(3);
  else if (cleaned.startsWith('0033')) subscriber = cleaned.slice(4);
  else if (cleaned.startsWith('0')) subscriber = cleaned.slice(1);
  else subscriber = cleaned;

  // Absorbe un eventuel 0 residuel (cas "+33 (0)6 ..." -> "06...").
  subscriber = subscriber.replace(/^0+/, '');

  // Numero FR valide = 9 chiffres significatifs commencant par 1-9.
  if (/^[1-9]\d{8}$/.test(subscriber)) {
    const national = '0' + subscriber; // 0612345678
    return national.match(/\d{2}/g)!.join(' '); // "06 12 34 56 78"
  }

  // Non reconnu comme FR -> on preserve la saisie trimmee.
  return raw;
}
