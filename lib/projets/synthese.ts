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
  /**
   * Ligne secondaire optionnelle, affichee en petit sous le contexte. Reserve
   * aux signaux qui n'existent que quand il y a un probleme (ex. l'OPCO en
   * retard de reglement sur la carte Finance) : jamais affichee "a vide".
   */
  alerteSecondaire?: string;
}

export interface SyntheseInput {
  projetRef: string;
  lancement: { terminees: number; total: number };
  production: { apprentisActifs: number; progressionPct: number | null };
  finance: {
    produitHt: number;
    factureHt: number;
    /** Retard de facturation / d'encaissement cote COMMISSION (ce que
     *  SOLUVIA facture au client) - distinct du flux OPCO, qui alimente
     *  uniquement la ligne alerteSecondaire ci-dessous. */
    retardFacturationHt: number;
    retardEncaissementHt: number;
    /** Retard OPCO cumule (facturation + encaissement), dans l'unite
     *  transmise a l'OPCO - jamais converti. Un OPCO qui ne regle pas n'est
     *  pas le meme probleme qu'un client qui ne regle pas : ce montant ne
     *  colore jamais le ton de la carte, il n'alimente que sa ligne
     *  secondaire. */
    opcoRetard: number;
  };
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

  const {
    produitHt,
    factureHt,
    retardFacturationHt,
    retardEncaissementHt,
    opcoRetard,
  } = input.finance;
  // Un retard, quel qu'il soit, est un retard : pas de seuil en pourcentage.
  // Un ratio facture/produit bas est la situation normale d'un projet qui
  // demarre (facturation par jalon) - ce n'est PAS ce qu'on mesure ici.
  const montantRetardCommission = retardFacturationHt + retardEncaissementHt;
  const enRetardCommission = montantRetardCommission > 0;
  const finance: CarteSynthese = {
    cle: 'finance',
    titre: 'Finance',
    valeur: formatCurrency(produitHt),
    // Le contexte devient la ligne la plus utile : le retard s'il y en a un,
    // le facture sinon.
    contexte: enRetardCommission
      ? `${formatCurrency(montantRetardCommission)} en retard`
      : `${formatCurrency(factureHt)} facturés`,
    href: `${base}/finance`,
    ton: enRetardCommission ? 'alerte' : 'neutre',
    ...(opcoRetard > 0
      ? {
          alerteSecondaire: `OPCO : ${formatCurrency(opcoRetard)} en retard de règlement`,
        }
      : {}),
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
