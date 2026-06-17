// Parse l'adresse libre stockee cote Soluvia vers des champs structures Odoo.
//
// Soluvia stocke deux champs texte libres sur `clients` :
//   - `adresse`      : la rue, parfois suffixee de "CP VILLE" ("5 rue X, 77176 SAVIGNY")
//   - `localisation` : souvent "CP VILLE" ("50300 Avranches") ou "Ville (dept)"
// Odoo (res.partner) attend des champs separes street / zip / city. Cette
// fonction extrait au mieux le code postal (5 chiffres) et la ville.

export interface ParsedFrAddress {
  street: string | null;
  zip: string | null;
  city: string | null;
}

export function parseFrAddress(
  adresse: string | null | undefined,
  localisation: string | null | undefined,
): ParsedFrAddress {
  const addr = (adresse ?? '').trim();
  const loc = (localisation ?? '').trim();

  // Cas 1 : "rue, 77176 SAVIGNY-LE-TEMPLE" -> tout est dans `adresse`.
  const inAddr = addr.match(/^(.*?)[,\s]+(\d{5})\s+(.+)$/);
  if (inAddr) {
    return {
      street: inAddr[1]!.trim() || null,
      zip: inAddr[2]!,
      city: inAddr[3]!.trim() || null,
    };
  }

  // Cas 2 : `adresse` = rue seule, CP+ville dans `localisation` "50300 Avranches".
  const inLoc = loc.match(/(\d{5})\s+(.+)$/);
  if (inLoc) {
    return {
      street: addr || null,
      zip: inLoc[1]!,
      city: inLoc[2]!.trim() || null,
    };
  }

  // Fallback : aucun code postal reperable -> rue seule, CP/ville inconnus.
  return { street: addr || null, zip: null, city: null };
}

// Lignes d'adresse a afficher sur un document legal (facture, devis,
// echeance). `adresse` et `localisation` sont deux champs texte libres
// souvent redondants : quand `adresse` contient deja "CP VILLE",
// `localisation` n'est qu'un libelle de region interne ("Lyon", "Rouen",
// "Aix en Provence") qui n'a rien a faire sur le document. On reutilise
// parseFrAddress (meme logique que la sync Odoo) pour ne garder que la rue +
// "CP VILLE", sans jamais dupliquer ni inventer la ville.
//
//   adresse "rue, CP VILLE" + localisation "Lyon" -> ["rue", "CP VILLE"]
//   adresse "rue"           + localisation "CP VILLE" -> ["rue", "CP VILLE"]
//   aucun CP reperable      -> [rue, localisation] (on ne perd pas une
//                              ville libre sans code postal)
export function formatClientAddressLines(
  adresse: string | null | undefined,
  localisation: string | null | undefined,
): string[] {
  const { street, zip, city } = parseFrAddress(adresse, localisation);
  const lines: string[] = [];
  if (street) lines.push(street);
  if (zip && city) {
    lines.push(`${zip} ${city}`);
    return lines;
  }
  // Aucun code postal repere : conserver la localisation libre uniquement si
  // elle apporte une info absente de la rue (ville sans CP).
  const loc = (localisation ?? '').trim();
  if (loc && loc !== street) lines.push(loc);
  return lines;
}
