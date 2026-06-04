// Calcul des totaux d'une facture à partir de ses lignes.
//
// Module pur (pas de 'use server', pas d'I/O) → testable sans DB et réutilisable
// par recomputeFactureTotaux (édition de lignes sur brouillon).

const TVA_RATE_DEFAULT = 20;

export interface FactureLigneAmount {
  montant_ht: number | null;
  taux_tva_ligne: number | null;
}

export interface FactureTotaux {
  totalHt: number;
  montantTva: number;
  montantTtc: number;
  /** Taux header dérivé (= montantTva/totalHt), cohérent même en taux mixtes. */
  tauxTvaEffectif: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Recalcule les totaux d'une facture en respectant le taux TVA PAR LIGNE
 * (`taux_tva_ligne`). Une facture à taux mixtes (devis personnalisé : lignes à
 * 20 % et lignes exonérées par ex.) garde ainsi une TVA cohérente avec le PDF
 * et Odoo — au lieu d'appliquer à plat un unique taux header. Quand une ligne
 * n'a pas de taux propre, on retombe sur `tauxHeader`.
 */
export function computeFactureTotaux(
  lignes: ReadonlyArray<FactureLigneAmount>,
  tauxHeader: number = TVA_RATE_DEFAULT,
): FactureTotaux {
  const totalHt = round2(
    lignes.reduce((s, l) => s + Number(l.montant_ht ?? 0), 0),
  );
  const montantTva = round2(
    lignes.reduce(
      (s, l) =>
        s +
        Math.round(
          Number(l.montant_ht ?? 0) * Number(l.taux_tva_ligne ?? tauxHeader),
        ) /
          100,
      0,
    ),
  );
  const montantTtc = round2(totalHt + montantTva);
  const tauxTvaEffectif =
    totalHt !== 0 ? round2((montantTva / totalHt) * 100) : tauxHeader;
  return { totalHt, montantTva, montantTtc, tauxTvaEffectif };
}
