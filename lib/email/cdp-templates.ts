import { sendEmail } from '@/lib/email/_send';
import { escapeHtml } from '@/lib/utils/escape-html';

const FROM = 'SOLUVIA <contact@mysoluvia.com>';

type SendResult = { success: boolean; error?: string; skipped?: boolean };

function wrap(body: string): string {
  return `
    <div style="font-family: -apple-system, sans-serif; color: #1a1a1a;">
      ${body}
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 11px; color: #6b7280;">
        Notification interne Soluvia - ne pas transferer au client.
      </p>
    </div>
  `;
}

function bouton(lien: string, libelle: string): string {
  return `<p><a href="${lien}" style="display: inline-block; background: #ed6572; color: white; padding: 12px 20px; border-radius: 6px; text-decoration: none;">${libelle}</a></p>`;
}

/** Affectation (F6 §11) : previent le CDP qu'un client lui est affecte. */
export async function sendAffectationCdpEmail(p: {
  to: string;
  raisonSociale: string;
  lienApp: string;
}): Promise<SendResult> {
  const nom = escapeHtml(p.raisonSociale);
  return sendEmail({
    from: FROM,
    to: p.to,
    subject: `Nouveau client affecte - ${p.raisonSociale}`,
    html: wrap(`
      <p>Bonjour,</p>
      <p>Le client <strong>${nom}</strong> vient de vous être affecté.</p>
      <p>La synthèse de passation (sections 1 à 7) est disponible dans votre
      portefeuille : identité, interlocuteurs, engagements négociés, calendrier
      prévisionnel et points de vigilance du Développeur.</p>
      ${bouton(p.lienApp, 'Ouvrir mon portefeuille')}
    `),
  });
}

/** Affectation (F6 §11) : previent le Developpeur que son client est pris en charge. */
export async function sendAffectationDevEmail(p: {
  to: string;
  raisonSociale: string;
  cdpNom: string;
  lienApp: string;
}): Promise<SendResult> {
  const nom = escapeHtml(p.raisonSociale);
  const cdp = escapeHtml(p.cdpNom);
  return sendEmail({
    from: FROM,
    to: p.to,
    subject: `Passation terminee - ${p.raisonSociale} affecte a ${p.cdpNom}`,
    html: wrap(`
      <p>Bonjour,</p>
      <p>Votre client <strong>${nom}</strong> vient d'être affecté à
      <strong>${cdp}</strong>, qui a reçu la synthèse de passation
      (sections 1 à 7).</p>
      <p>La passation commerciale est terminée : le pilotage opérationnel
      passe au Chef de Projet.</p>
      ${bouton(p.lienApp, 'Ouvrir le dossier')}
    `),
  });
}

/** Reaffectation (F7 §6) : previent l'ancien CDP et la Direction. */
export async function sendReaffectationEmail(p: {
  to: string[];
  raisonSociale: string;
  ancienCdpNom: string;
  nouveauCdpNom: string;
  justification: string | null;
  lienApp: string;
}): Promise<SendResult> {
  const nom = escapeHtml(p.raisonSociale);
  const ancien = escapeHtml(p.ancienCdpNom);
  const nouveau = escapeHtml(p.nouveauCdpNom);
  const justif = p.justification ? escapeHtml(p.justification) : null;
  return sendEmail({
    from: FROM,
    to: p.to,
    subject: `Reaffectation client - ${p.raisonSociale}`,
    html: wrap(`
      <p>Bonjour,</p>
      <p>Le client <strong>${nom}</strong> a été réaffecté :
      <strong>${ancien}</strong> &rarr; <strong>${nouveau}</strong>.</p>
      ${justif ? `<p>Justification : ${justif}</p>` : ''}
      <p>Le changement est tracé dans l'historique d'affectation du client.</p>
      ${bouton(p.lienApp, 'Ouvrir le plan de charge')}
    `),
  });
}

/** Seuil 95 % (F7 §4) : alerte Direction sur un CDP rouge. */
export async function sendCdpSaturationEmail(p: {
  to: string[];
  cdpNom: string;
  chargePct: number;
  disponibilite: string | null;
  lienApp: string;
}): Promise<SendResult> {
  const cdp = escapeHtml(p.cdpNom);
  return sendEmail({
    from: FROM,
    to: p.to,
    subject: `Alerte saturation CDP - ${p.cdpNom} a ${p.chargePct} %`,
    html: wrap(`
      <p>Bonjour,</p>
      <p>Le Chef de Projet <strong>${cdp}</strong> atteint
      <strong>${p.chargePct} %</strong> de sa saturation théorique
      (5 clients ou 300 alternants)${
        p.disponibilite === 'sature' ? ', et se déclare lui-même saturé' : ''
      }.</p>
      <p>Il ne sera plus proposé dans le Top 3 des affectations tant que sa
      charge ne redescend pas.</p>
      ${bouton(p.lienApp, 'Ouvrir le plan de charge')}
    `),
  });
}

/** Cas critique (F7 §4) : tous les CDP sont rouges, escalade Direction. */
export async function sendTousCdpSaturesEmail(p: {
  to: string[];
  nbCdp: number;
  nbClientsEnAttente: number;
  lienApp: string;
}): Promise<SendResult> {
  return sendEmail({
    from: FROM,
    to: p.to,
    subject: `Escalade - tous les CDP sont satures (${p.nbCdp})`,
    html: wrap(`
      <p>Bonjour,</p>
      <p><strong>Les ${p.nbCdp} Chefs de Projet sont tous au-dessus du seuil
      rouge</strong> (95 % de la saturation théorique ou saturation déclarée).</p>
      <p>${
        p.nbClientsEnAttente > 0
          ? `<strong>${p.nbClientsEnAttente} client(s)</strong> attendent une affectation qui ne peut plus se faire sereinement.`
          : 'Aucun client en attente pour le moment, mais toute nouvelle signature sera bloquée.'
      }</p>
      <p>Une décision de la Direction est attendue : recrutement, réaffectation
      de portefeuilles ou arbitrage exceptionnel.</p>
      ${bouton(p.lienApp, 'Ouvrir le plan de charge')}
    `),
  });
}
