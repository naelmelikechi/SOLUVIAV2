// Detection du regime TVA d'une vente B2B.
//
// Regle CGI :
//   - Client francais (FR...) ou client sans TVA UE -> TVA 20 %
//   - Client B2B avec TVA intracom UE non-FR -> exoneration (TVA 0 %)
//     avec mention obligatoire "Autoliquidation - Art. 283-2 CGI" sur la
//     facture. Le client paye la TVA dans son pays.

const EU_NON_FR_PREFIXES = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'DE',
  'EL',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
]);

export type TvaRegime = {
  taux: number;
  isAutoliquidation: boolean;
  countryCode: string | null;
};

export function resolveTvaRegime(
  tvaIntracommunautaire: string | null | undefined,
): TvaRegime {
  if (!tvaIntracommunautaire || tvaIntracommunautaire.trim() === '') {
    return { taux: 20, isAutoliquidation: false, countryCode: null };
  }

  const cleaned = tvaIntracommunautaire.replace(/\s/g, '').toUpperCase();
  const prefix = cleaned.slice(0, 2);

  if (EU_NON_FR_PREFIXES.has(prefix)) {
    return { taux: 0, isAutoliquidation: true, countryCode: prefix };
  }

  return {
    taux: 20,
    isAutoliquidation: false,
    countryCode: /^[A-Z]{2}/.test(prefix) ? prefix : null,
  };
}

export const AUTOLIQUIDATION_MENTION =
  'Autoliquidation - TVA due par le preneur (Art. 283-2 du CGI).';
