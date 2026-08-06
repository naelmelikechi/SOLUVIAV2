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
  contrats: { total: number; actifs: number };
}

/** Prefixe d'URL commun a toutes les cartes. Partage par buildSyntheseCards et
 * buildCarteQualite pour que la carte isolee pointe exactement au meme endroit
 * que les autres. */
function baseHref(projetRef: string): string {
  return `/projets/${encodeURIComponent(projetRef)}`;
}

/** Vert au-dessus de 80, orange entre 50 et 79, rouge en dessous. Meme echelle
 * que les volets de performance (lib/queries/projet-performance.ts) pour ne pas
 * qu'un CDP apprenne deux codes couleur differents. Utilisee uniquement par les
 * cartes production et qualite : les seules dont on sait aujourd'hui dire si la
 * valeur est bonne ou mauvaise. */
function tonDepuisPct(pct: number): TonCarte {
  if (pct >= 80) return 'neutre';
  if (pct >= 50) return 'attention';
  return 'alerte';
}

export function buildSyntheseCards(input: SyntheseInput): CarteSynthese[] {
  const base = baseHref(input.projetRef);

  const { terminees, total: totalEtapes } = input.lancement;
  const lancement: CarteSynthese = {
    cle: 'lancement',
    titre: 'Lancement',
    valeur: `${terminees}/${totalEtapes}`,
    contexte: 'étapes terminées',
    href: `${base}/lancement`,
    // Toujours neutre au lot 0 : un lancement en cours n'est pas une anomalie,
    // et la notion de retard (date d'objectif depassee) n'existe pas encore.
    // Elle arrive au lot 1, c'est elle qui colorera cette carte.
    ton: 'neutre',
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
    // Toujours neutre au lot 0 : un ratio facture/produit bas est la situation
    // normale d'un projet qui demarre (facturation par jalon). Le vrai signal,
    // "en retard de facturation", arrive au lot 3 et colorera cette carte.
    ton: 'neutre',
  };

  const contrats: CarteSynthese = {
    cle: 'contrats',
    titre: 'Contrats',
    valeur: String(input.contrats.total),
    contexte: `${input.contrats.actifs} actif${input.contrats.actifs > 1 ? 's' : ''}`,
    href: `${base}/contrats`,
    ton: 'neutre',
  };

  return [lancement, production, finance, contrats];
}

/**
 * Carte Qualite, construite a part : son score vient d'une cascade d'appels
 * HTTP vers Eduvia, bien plus lente que les requetes SQL des 4 autres cartes.
 * La synthese la rend dans son propre composant async sous <Suspense> pour ne
 * pas retenir l'affichage du reste.
 */
export function buildCarteQualite(
  projetRef: string,
  qualite: { realise: number; total: number },
): CarteSynthese {
  const base = baseHref(projetRef);
  const { realise, total: totalLivrables } = qualite;
  const qualitePct =
    totalLivrables > 0 ? (realise / totalLivrables) * 100 : null;

  return {
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
}
