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
        Document interne Soluvia - ne pas transferer au client.
      </p>
    </div>
  `;
}

function bouton(lien: string, libelle: string): string {
  return `<p><a href="${lien}" style="display: inline-block; background: #ed6572; color: white; padding: 12px 20px; border-radius: 6px; text-decoration: none;">${libelle}</a></p>`;
}

/** Vague 1 : PDF complet en pièce jointe aux Référents CDP + Direction. */
export async function sendSyntheseVague1Email(p: {
  to: string[];
  raisonSociale: string;
  referenceDossier: string;
  developpeur: string | null;
  lienFiche: string;
  pdfComplet: Buffer;
}): Promise<SendResult> {
  const nom = escapeHtml(p.raisonSociale);
  const ref = escapeHtml(p.referenceDossier);
  const dev = p.developpeur ? escapeHtml(p.developpeur) : null;
  return sendEmail({
    from: FROM,
    to: p.to,
    subject: `Passation ${ref} - ${p.raisonSociale} : affectation CDP attendue`,
    html: wrap(`
      <p>Bonjour,</p>
      <p>La synthèse de passation de <strong>${nom}</strong> (dossier
      <strong>${ref}</strong>) vient d'être soumise${dev ? ` par ${dev}` : ''}.
      Vous la trouverez en pièce jointe (version complète, sections 1 à 8).</p>
      <p>Prochaine étape : <strong>affecter un Chef de Projet</strong> - délai cible 24h.
      Le CDP affecté recevra automatiquement la version sans la section 8.</p>
      ${bouton(p.lienFiche, 'Ouvrir le dossier')}
    `),
    attachments: [
      {
        filename: `synthese-passation-${p.referenceDossier}.pdf`,
        content: p.pdfComplet,
      },
    ],
  });
}

/** Escalade 48h : le Développeur n'a pas soumis la synthèse. */
export async function sendPassationEscaladeDevEmail(p: {
  to: string[];
  prospectNom: string;
  referenceDossier: string;
  lienFiche: string;
}): Promise<SendResult> {
  const nom = escapeHtml(p.prospectNom);
  const ref = escapeHtml(p.referenceDossier);
  return sendEmail({
    from: FROM,
    to: p.to,
    subject: `Passation ${ref} - synthese non soumise 48h apres signature`,
    html: wrap(`
      <p>Bonjour,</p>
      <p>La synthèse de passation de <strong>${nom}</strong> (dossier
      <strong>${ref}</strong>) n'a toujours pas été soumise au Référent CDP,
      plus de <strong>48h</strong> après la signature du contrat.</p>
      <p>La mémoire commerciale s'effrite vite : merci de compléter les sections 6 et 8
      et de soumettre la synthèse au plus tôt.</p>
      ${bouton(p.lienFiche, 'Compléter la synthèse')}
    `),
  });
}

/** Rappel 18h : le Référent CDP n'a pas encore affecté de CDP. */
export async function sendPassationRappelReferentEmail(p: {
  to: string[];
  raisonSociale: string;
  referenceDossier: string;
  lienFiche: string;
}): Promise<SendResult> {
  const nom = escapeHtml(p.raisonSociale);
  const ref = escapeHtml(p.referenceDossier);
  return sendEmail({
    from: FROM,
    to: p.to,
    subject: `Passation ${ref} - affectation CDP en attente`,
    html: wrap(`
      <p>Bonjour,</p>
      <p>La synthèse de passation de <strong>${nom}</strong> (dossier
      <strong>${ref}</strong>) attend une affectation CDP depuis plus de 18h.</p>
      <p>Délai cible : 24h après soumission. Merci d'arbitrer.</p>
      ${bouton(p.lienFiche, 'Ouvrir le plan de charge')}
    `),
  });
}

/** Escalade Direction : 48h après signature, pas de CDP affecté. */
export async function sendPassationEscaladeDirectionEmail(p: {
  to: string[];
  raisonSociale: string;
  referenceDossier: string;
  lienFiche: string;
}): Promise<SendResult> {
  const nom = escapeHtml(p.raisonSociale);
  const ref = escapeHtml(p.referenceDossier);
  return sendEmail({
    from: FROM,
    to: p.to,
    subject: `Passation ${ref} - escalade : pas de CDP affecte 48h apres signature`,
    html: wrap(`
      <p>Bonjour,</p>
      <p>Plus de <strong>48h</strong> après la signature de <strong>${nom}</strong>
      (dossier <strong>${ref}</strong>), la passation n'est pas terminée :
      aucun Chef de Projet n'est affecté.</p>
      <p>Une intervention de la Direction est attendue pour débloquer l'arbitrage.</p>
      ${bouton(p.lienFiche, 'Ouvrir le dossier')}
    `),
  });
}
