/**
 * Glossaire métier : définitions courtes en français simple des termes
 * spécialisés de l'app. Affichées via <TermeHint> (souligné pointillé +
 * tooltip) pour aider la prise en main sans alourdir l'UI.
 *
 * Convention : phrases courtes, pas de jargon dans la définition,
 * tirets simples (jamais de em-dash).
 */
export const GLOSSAIRE = {
  echeance:
    "Montant attendu de l'OPCO à une date donnée, calculé depuis le contrat. Une facture est émise quand une échéance est due.",
  a_emettre:
    'Facture préparée mais pas encore envoyée. Elle ne porte pas encore de numéro définitif et reste modifiable.',
  avoir:
    "Facture négative qui annule tout ou partie d'une facture déjà émise (une facture émise ne peut jamais être supprimée).",
  ajustement:
    'Correction à appliquer sur une prochaine facture (trop ou pas assez facturé), détectée en comparant le contrat et ce qui a déjà été facturé.',
  reste_a_facturer:
    'Part du contrat pas encore facturée : montant total attendu moins ce qui a déjà été émis.',
  facture_hors_projet:
    'Facture libre, sans projet ni contrat associé : prestation ponctuelle, refacturation, etc.',
  societe_emettrice:
    'Entité juridique qui émet la facture (SOLUVIA, DIGIVIA...). Chaque société a sa propre numérotation.',
  commission:
    'Rémunération SOLUVIA : un pourcentage des encaissements OPCO du client, selon le contrat de partenariat.',
  passation:
    "Dossier de transmission d'une affaire gagnée par le commercial vers le chef de projet qui la produira.",
  vague_1:
    'Première transmission de la synthèse de passation : au référent CDP et à la direction, pour affectation.',
  vague_2:
    "Diffusion de la synthèse au chef de projet affecté, une fois l'affectation décidée.",
  axes_temps:
    "Catégories d'activité (pédagogie, administratif...) utilisées pour ventiler les heures saisies sur un projet.",
  npec: "Niveau de prise en charge : montant annuel que l'OPCO paye pour un contrat d'apprentissage donné.",
  opco: 'Opérateur de compétences : organisme qui finance la formation des apprentis et paye les factures des CFA.',
  deca: "Base nationale des contrats d'apprentissage. Sans numéro DECA, l'OPCO refuse la facture : émission bloquée.",
} as const;

export type TermeGlossaire = keyof typeof GLOSSAIRE;
