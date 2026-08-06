import { formatCurrency } from '@/lib/utils/formatters';

/**
 * Ton visuel d'une carte de synthese. Volontairement limite a trois valeurs :
 * une palette plus riche pousse a colorer des cartes qui n'ont rien a signaler,
 * et la synthese redevient un mur d'informations.
 */
export type TonCarte = 'neutre' | 'attention' | 'alerte';

export type CleCarte =
  | 'lancement'
  | 'production'
  | 'finance'
  | 'qualite'
  | 'contrats';

export interface CarteSynthese {
  cle: CleCarte;
  titre: string;
  /** Le chiffre-cle, deja formate pour l'affichage. */
  valeur: string;
  /** UNE ligne de contexte. Jamais deux, jamais un paragraphe. */
  contexte: string;
  href: string;
  ton: TonCarte;
}

export interface SyntheseInput {
  projetRef: string;
  lancement: { terminees: number; total: number };
  production: { apprentisActifs: number; progressionPct: number | null };
  finance: { produitHt: number; factureHt: number };
  qualite: { realise: number; total: number };
  contrats: { total: number; actifs: number };
}

/** Vert au-dessus de 80, orange entre 50 et 79, rouge en dessous. Meme echelle
 * que les volets de performance (lib/queries/projet-performance.ts) pour ne pas
 * qu'un CDP apprenne deux codes couleur differents. */
function tonDepuisPct(pct: number): TonCarte {
  if (pct >= 80) return 'neutre';
  if (pct >= 50) return 'attention';
  return 'alerte';
}

export function buildSyntheseCards(input: SyntheseInput): CarteSynthese[] {
  const base = `/projets/${encodeURIComponent(input.projetRef)}`;

  const { terminees, total: totalEtapes } = input.lancement;
  const lancement: CarteSynthese = {
    cle: 'lancement',
    titre: 'Lancement',
    valeur: `${terminees}/${totalEtapes}`,
    contexte: 'étapes terminées',
    href: `${base}/lancement`,
    ton: terminees >= totalEtapes ? 'neutre' : 'attention',
  };

  const { apprentisActifs, progressionPct } = input.production;
  const production: CarteSynthese = {
    cle: 'production',
    titre: 'Production',
    valeur: progressionPct == null ? '-' : `${Math.round(progressionPct)} %`,
    contexte:
      apprentisActifs === 0
        ? 'aucun apprenti actif'
        : `${apprentisActifs} apprenti${apprentisActifs > 1 ? 's' : ''} actif${apprentisActifs > 1 ? 's' : ''}`,
    href: `${base}/production`,
    // Progression inconnue = pas d'information, donc pas d'alarme.
    ton: progressionPct == null ? 'neutre' : tonDepuisPct(progressionPct),
  };

  const { produitHt, factureHt } = input.finance;
  const finance: CarteSynthese = {
    cle: 'finance',
    titre: 'Finance',
    valeur: formatCurrency(produitHt),
    contexte: `${formatCurrency(factureHt)} facturés`,
    href: `${base}/finance`,
    // Un projet sans production n'a rien a facturer : ce n'est pas un retard.
    ton:
      produitHt <= 0 ? 'neutre' : tonDepuisPct((factureHt / produitHt) * 100),
  };

  const { realise, total: totalLivrables } = input.qualite;
  const qualitePct =
    totalLivrables > 0 ? (realise / totalLivrables) * 100 : null;
  const qualite: CarteSynthese = {
    cle: 'qualite',
    titre: 'Qualité',
    valeur: qualitePct == null ? '-' : `${Math.round(qualitePct)} %`,
    contexte:
      qualitePct == null
        ? 'référentiel non disponible'
        : `${realise}/${totalLivrables} livrables`,
    href: `${base}/qualite`,
    ton: qualitePct == null ? 'neutre' : tonDepuisPct(qualitePct),
  };

  const contrats: CarteSynthese = {
    cle: 'contrats',
    titre: 'Contrats',
    valeur: String(input.contrats.total),
    contexte: `${input.contrats.actifs} actifs`,
    href: `${base}/contrats`,
    ton: 'neutre',
  };

  return [lancement, production, finance, qualite, contrats];
}
