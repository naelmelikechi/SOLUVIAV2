import { type TypeRdv } from '@/lib/utils/constants';

/**
 * Gabarits de compte-rendu et brouillons de mail post-RDV (Feature 3 §5/§6).
 *
 * Module PUR (aucune I/O) : les fonctions sont testables en isolation et
 * partagées entre l'UI (bouton « Charger le gabarit » / « Générer le mail »)
 * et les actions serveur.
 *
 * Versionné : la version chargée est figée dans la note côté fiche (si la
 * trame Soluvia évolue, l'ancien CR reste sur la version utilisée).
 */
export const GABARIT_VERSION = 'v1';

// ---------------------------------------------------------------------------
// Gabarits de note (compte-rendu) — trame texte par type de RDV (§5)
// ---------------------------------------------------------------------------

const NOTE_GABARITS: Record<TypeRdv, string> = {
  presentation: `Compte-rendu — RDV de présentation

Points abordés :
- 

Retours et réactions du prospect :
- 

Prochaine étape :
- (RDV de cadrage à programmer)`,

  cadrage: `Compte-rendu — RDV de cadrage

1. Ce que j'ai retenu du projet
- Volume d'alternants visé :
- Métiers / secteurs visés :
- Objectifs et calendrier :
- Motivations principales :
- Contexte interne (porteur, maturité du sujet, freins) :

2. Comment Soluvia peut accompagner
- (réponse point par point à chaque besoin exprimé, en rappelant le rôle de nos outils Soluvia : Eduvia — ERP CFA — et Digivia — plateforme e-learning)

3. Prochaines étapes
- RDV d'audit à programmer
- Pièce(s) à transmettre :`,

  audit_tunnel_a: `Compte-rendu — RDV d'audit (Tunnel A — Entreprise)

Résultats de l'analyse AlternaRH :
- Profils convertibles identifiés :
- Domaines / formations envisagés :

Modalités financières actées :
- Taux de commission (NPEC) :
- Mois de démarrage de la facturation :
- Durée du partenariat :

Première lecture du contrat-cadre :
- Points soulevés :

Prochaine étape :
- RDV de signature à programmer`,

  audit_tunnel_b: `Compte-rendu — RDV d'audit (Tunnel B — CFA existant)

Audit du CFA existant :
- Catalogue de formations :
- Volume d'alternants :
- Conventionnement OPCO :
- État Qualiopi :
- Outils en place :
- Leviers de bascule identifiés :

Modalités financières actées :
- Taux de commission (NPEC) :
- Mois de démarrage de la facturation :
- Durée du partenariat :

Première lecture du contrat-cadre :
- Points soulevés :

Prochaine étape :
- RDV de signature à programmer`,

  signature: `Compte-rendu — RDV de signature

Signature confirmée :
- Date de signature :
- Contrat-cadre signé par les deux parties :

Lancement de la Mission A :
- Date cible de la première cohorte :
- Référent CDP informé :

Passation Développeur → Chef de Projet :
- Points à transmettre :`,

  autre: '',
};

/** Trame texte du compte-rendu pré-rempli pour un type de RDV (vide pour `autre`). */
export function getNoteGabarit(typeRdv: TypeRdv): string {
  return NOTE_GABARITS[typeRdv];
}

// ---------------------------------------------------------------------------
// Brouillon de mail post-RDV — sujet + corps HTML par type de RDV (§6)
// ---------------------------------------------------------------------------

export interface PostRdvMailVars {
  typeRdv: TypeRdv;
  raisonSociale: string;
  contactNom?: string;
  dateRdv: string;
  developpeurNom?: string;
}

export interface PostRdvMailDraft {
  subject: string;
  bodyHtml: string;
}

/**
 * Construit le brouillon (sujet + corps HTML) du mail post-RDV selon le type,
 * en injectant les variables de la fiche prospect et du RDV.
 *
 * Le corps est un fragment HTML (paragraphes) destiné à être enveloppé par
 * `sendCommercialMail`. C'est un brouillon : le Développeur le relit, ajuste
 * et complète les champs entre crochets avant l'envoi.
 */
export function getPostRdvMailDraft(vars: PostRdvMailVars): PostRdvMailDraft {
  const salutation = vars.contactNom
    ? `Bonjour ${vars.contactNom},`
    : 'Bonjour,';
  const signature = vars.developpeurNom
    ? `${vars.developpeurNom}<br/>Développeur de portefeuille — Soluvia`
    : 'Développeur de portefeuille — Soluvia';

  const subjects: Record<TypeRdv, string> = {
    presentation: `Suite à notre rendez-vous — Présentation Soluvia ${vars.raisonSociale}`,
    cadrage: `Suite à notre rendez-vous — Projet alternance ${vars.raisonSociale}`,
    audit_tunnel_a: `Suite à notre rendez-vous d'audit — Projet alternance ${vars.raisonSociale}`,
    audit_tunnel_b: `Suite à notre rendez-vous d'audit — Projet alternance ${vars.raisonSociale}`,
    signature: `Bienvenue chez Soluvia — Lancement du projet ${vars.raisonSociale}`,
    autre: `Suite à notre rendez-vous — ${vars.raisonSociale}`,
  };

  const bodies: Record<TypeRdv, string> = {
    presentation: `<p>${salutation}</p>
<p>Suite à notre échange du ${vars.dateRdv}, je vous transmets en pièce jointe la présentation Soluvia que nous avons parcourue ensemble.</p>
<p>Comme convenu, nous nous reverrons prochainement pour un rendez-vous de cadrage afin d'approfondir votre projet et les enjeux que vous nous avez partagés.</p>
<p>Je reste à votre disposition d'ici là pour toute question.</p>
<p>Cordialement,<br/>${signature}</p>`,

    cadrage: `<p>${salutation}</p>
<p>Suite à notre rendez-vous du ${vars.dateRdv}, je reviens vers vous avec un récapitulatif de ce que nous avons partagé et les prochaines étapes que je vous propose.</p>
<p><strong>Ce que j'ai retenu de votre projet</strong><br/>[À compléter : volume d'alternants visé, métiers concernés, objectifs et motivations exprimés pendant le rendez-vous.]</p>
<p><strong>Comment Soluvia peut vous accompagner</strong><br/>[À compléter : réponse point par point à chaque besoin exprimé, en rappelant le rôle de nos outils Soluvia — Eduvia (ERP CFA) et Digivia (plateforme e-learning).]</p>
<p><strong>Prochaines étapes</strong><br/>Je vous propose de nous revoir pour un rendez-vous d'audit financier. L'objectif serait d'aboutir à une signature et au lancement opérationnel.</p>
<p>Je reste à votre disposition d'ici notre prochain échange.</p>
<p>Cordialement,<br/>${signature}</p>`,

    audit_tunnel_a: `<p>${salutation}</p>
<p>Suite à notre rendez-vous d'audit du ${vars.dateRdv}, je reviens vers vous avec un récapitulatif des éléments actés et les prochaines étapes.</p>
<p><strong>Ce que nous avons acté</strong><br/>À l'issue de l'analyse réalisée via notre outil AlternaRH, nous avons identifié [N] profils convertibles en apprentissage parmi votre effectif. Nous avons convergé sur les modalités financières suivantes : taux de commission de [X %] de la prise en charge OPCO, démarrage de la facturation au mois [0/1/2/3], durée du partenariat de [X] ans.</p>
<p>Comme convenu, vous trouverez en pièce jointe le projet de contrat-cadre Soluvia / CFA. Nous nous reverrons prochainement pour la signature et le lancement opérationnel.</p>
<p>Je reste à votre disposition pour toute question.</p>
<p>Cordialement,<br/>${signature}</p>`,

    audit_tunnel_b: `<p>${salutation}</p>
<p>Suite à notre rendez-vous d'audit du ${vars.dateRdv}, je reviens vers vous avec un récapitulatif des éléments actés et les prochaines étapes.</p>
<p><strong>Ce que nous avons acté</strong><br/>À l'issue de l'audit de votre structure existante, nous avons identifié les leviers de bascule suivants : [catalogue à enrichir, optimisation du conventionnement OPCO, mise en conformité Qualiopi, outils en place]. Nous avons convergé sur les modalités financières suivantes : taux de commission de [X %] de la prise en charge OPCO, démarrage de la facturation au mois [0/1/2/3], durée du partenariat de [X] ans.</p>
<p>Comme convenu, vous trouverez en pièce jointe le projet de contrat-cadre Soluvia / CFA. Nous nous reverrons prochainement pour la signature et le lancement opérationnel.</p>
<p>Je reste à votre disposition pour toute question.</p>
<p>Cordialement,<br/>${signature}</p>`,

    signature: `<p>${salutation}</p>
<p>Je vous remercie pour la signature du contrat-cadre Soluvia / CFA. Vous trouverez en pièce jointe le contrat signé pour vos archives.</p>
<p><strong>Le lancement de votre CFA démarre dès à présent</strong><br/>Nous entamons la Mission A — Lancement de votre CFA, qui s'étend sur les six prochains mois : création de la structure juridique et obtention du SIRET, Numéro de Déclaration d'Activité, numéro UAI, certification Qualiopi, conventionnement OPCO et configuration de votre instance Eduvia (notre ERP CFA propriétaire).</p>
<p><strong>Votre Chef de Projet dédié</strong><br/>Notre Référent Chef de Projet, mis en copie de ce mail, vous présentera dans les prochains jours le Chef de Projet Soluvia qui sera dédié à votre CFA.</p>
<p>Je reste votre interlocuteur d'ici la prise en main avec votre Chef de Projet.</p>
<p>Cordialement,<br/>${signature}</p>`,

    autre: `<p>${salutation}</p>
<p>Suite à notre rendez-vous du ${vars.dateRdv}, je reviens vers vous pour faire le point et vous proposer les prochaines étapes.</p>
<p>Je reste à votre disposition pour toute question.</p>
<p>Cordialement,<br/>${signature}</p>`,
  };

  return { subject: subjects[vars.typeRdv], bodyHtml: bodies[vars.typeRdv] };
}
