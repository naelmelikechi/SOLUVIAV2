import { sendEmail } from '@/lib/email/_send';
import { escapeHtml } from '@/lib/utils/escape-html';

// Emails des garde-fous commerciaux CRM (specs validees Direction 2026-06-09) :
// taux derogatoire < 35 % et sante des opportunites (30 j sans activite).
// Meme gabarit que lib/email/passation-templates.ts.

const FROM = 'SOLUVIA <contact@mysoluvia.com>';

type SendResult = { success: boolean; error?: string; skipped?: boolean };

function wrap(body: string): string {
  return `
    <div style="font-family: -apple-system, sans-serif; color: #1a1a1a;">
      ${body}
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 11px; color: #6b7280;">
        Alerte automatique Soluvia - document interne.
      </p>
    </div>
  `;
}

function bouton(lien: string, libelle: string): string {
  return `<p><a href="${lien}" style="display: inline-block; background: #ed6572; color: white; padding: 12px 20px; border-radius: 6px; text-decoration: none;">${libelle}</a></p>`;
}

/** Alerte Direction : un taux NPEC < 35 % vient d'être saisi sur une opportunité. */
export async function sendTauxDerogatoireEmail(p: {
  to: string[];
  compte: string;
  opportunite: string;
  taux: number;
  saisiPar: string;
  lienPipeline: string;
}): Promise<SendResult> {
  const compte = escapeHtml(p.compte);
  const opp = escapeHtml(p.opportunite);
  const auteur = escapeHtml(p.saisiPar);
  return sendEmail({
    from: FROM,
    to: p.to,
    subject: `[SOLUVIA] Taux derogatoire < 35 % - ${p.compte}`,
    html: wrap(`
      <p>Bonjour,</p>
      <p>Un taux NPEC <strong>inférieur au seuil de 35 %</strong> vient d'être saisi
      dans le pipeline commercial :</p>
      <ul style="line-height: 1.8;">
        <li>Opportunité : <strong>${opp}</strong></li>
        <li>Compte : <strong>${compte}</strong></li>
        <li>Taux saisi : <strong>${p.taux} %</strong></li>
        <li>Saisi par : <strong>${auteur}</strong></li>
      </ul>
      <p>Conformément à la règle Direction, tout taux négocié sous 35 % doit être
      validé explicitement.</p>
      ${bouton(p.lienPipeline, 'Ouvrir le pipeline')}
    `),
  });
}

/** Alerte 30 j : opportunité ouverte sans aucune activité depuis 30 jours. */
export async function sendSanteOpportuniteEmail(p: {
  to: string[];
  compte: string | null;
  opportunite: string;
  owner: string | null;
  joursInactif: number;
  lienPipeline: string;
}): Promise<SendResult> {
  const opp = escapeHtml(p.opportunite);
  const compte = p.compte ? escapeHtml(p.compte) : null;
  const owner = p.owner ? escapeHtml(p.owner) : null;
  return sendEmail({
    from: FROM,
    to: p.to,
    subject: `[SOLUVIA] Opportunite sans activite depuis ${p.joursInactif} j - ${p.opportunite}`,
    html: wrap(`
      <p>Bonjour,</p>
      <p>L'opportunité <strong>${opp}</strong>${compte ? ` (compte <strong>${compte}</strong>)` : ''}
      est toujours ouverte mais n'a enregistré <strong>aucune activité depuis
      ${p.joursInactif} jours</strong> (ni note, ni RDV, ni mise à jour).</p>
      ${owner ? `<p>Commercial en charge : <strong>${owner}</strong>.</p>` : ''}
      <p>Merci de relancer le dossier ou d'acter sa clôture (gagnée / perdue)
      pour garder un pipeline fiable.</p>
      ${bouton(p.lienPipeline, 'Ouvrir le pipeline')}
    `),
  });
}
