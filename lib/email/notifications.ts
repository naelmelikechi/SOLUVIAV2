import { Resend } from 'resend';
import { env } from '@/lib/env';
import { logger } from '@/lib/utils/logger';
import { formatDate } from '@/lib/utils/formatters';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

const FROM = 'SOLUVIA <contact@mysoluvia.com>';
const APP_URL = 'https://soluvia.vercel.app';

type SendResult = { success: boolean; error?: string };

function formatEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function wrapHtml(options: {
  title: string;
  preheader: string;
  headerBg: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
}): string {
  const { title, preheader, headerBg, body, ctaLabel, ctaHref } = options;
  const cta =
    ctaLabel && ctaHref
      ? `<div style="text-align:center;margin:24px 0 8px;">
          <a href="${ctaHref}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">${ctaLabel}</a>
         </div>`
      : '';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background-color:#f5f7f5;">
<span style="display:none!important;color:#f5f7f5;">${preheader}</span>
<div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #d4e4d4;">
  <div style="background:${headerBg};padding:28px 32px;text-align:center;">
    <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:1px;">SOLUVIA</h1>
    <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:13px;">${title}</p>
  </div>
  <div style="padding:32px;">
    ${body}
    ${cta}
  </div>
  <div style="background:#f0f5f0;padding:16px 32px;border-top:1px solid #d4e4d4;">
    <p style="margin:0;color:#6b8a6b;font-size:11px;text-align:center;">SOLUVIA - Plateforme de pilotage pour organismes de formation</p>
  </div>
</div></body></html>`;
}

// ---------------------------------------------------------------------------
// 1. Temps non saisi (quotidien 18h Paris, lun-ven)
// ---------------------------------------------------------------------------

export async function sendTempsNonSaisiEmail(params: {
  to: string;
  prenom: string;
  dateJour: string;
  heuresManquantes: number;
}): Promise<SendResult> {
  if (!resend) return { success: false, error: 'Resend non configuré' };

  const { to, prenom, dateJour, heuresManquantes } = params;
  const dateLabel = formatDate(dateJour);

  const body = `
    <h2 style="margin:0 0 16px;font-size:18px;color:#1a2e1a;">Bonjour ${prenom},</h2>
    <p style="margin:0 0 12px;color:#2d4a2d;font-size:14px;line-height:1.6;">
      Il te manque <strong>${heuresManquantes}h</strong> pour compléter ta saisie du <strong>${dateLabel}</strong>.
    </p>
    <p style="margin:0 0 12px;color:#2d4a2d;font-size:14px;line-height:1.6;">
      Pense à renseigner ton temps avant de quitter la journée pour que tes heures soient prises en compte.
    </p>`;

  const html = wrapHtml({
    title: 'Rappel de saisie du temps',
    preheader: `Il te manque ${heuresManquantes}h pour aujourd'hui`,
    headerBg: '#16a34a',
    body,
    ctaLabel: 'Saisir mon temps',
    ctaHref: `${APP_URL}/temps`,
  });

  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'SOLUVIA - Pense à saisir ton temps',
      html,
    });
    return { success: true };
  } catch (error) {
    logger.error('email.notif.temps', 'Échec envoi', { to, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    };
  }
}

// ---------------------------------------------------------------------------
// 2. Factures en retard (hebdomadaire lundi 9h)
// ---------------------------------------------------------------------------

export type FactureRetardItem = {
  ref: string;
  client: string;
  montantTtc: number;
  joursRetard: number;
};

export async function sendFacturesRetardDigestEmail(params: {
  to: string;
  prenom: string;
  factures: FactureRetardItem[];
}): Promise<SendResult> {
  if (!resend) return { success: false, error: 'Resend non configuré' };
  if (params.factures.length === 0) return { success: true }; // nothing to send

  const { to, prenom, factures } = params;
  const totalTtc = factures.reduce((s, f) => s + f.montantTtc, 0);

  const rows = factures
    .slice(0, 10)
    .map(
      (f) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f0f5f0;font-size:13px;color:#1a2e1a;font-weight:600;">${f.ref}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f0f5f0;font-size:13px;color:#2d4a2d;">${f.client}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f0f5f0;font-size:13px;color:#b91c1c;text-align:right;">${formatEur(f.montantTtc)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f0f5f0;font-size:13px;color:#6b8a6b;text-align:right;">${f.joursRetard}j</td>
      </tr>`,
    )
    .join('');

  const restantes =
    factures.length > 10
      ? `<p style="margin:12px 0 0;color:#6b8a6b;font-size:12px;font-style:italic;">... et ${factures.length - 10} autres factures</p>`
      : '';

  const body = `
    <h2 style="margin:0 0 16px;font-size:18px;color:#1a2e1a;">Bonjour ${prenom},</h2>
    <p style="margin:0 0 16px;color:#2d4a2d;font-size:14px;line-height:1.6;">
      <strong>${factures.length}</strong> facture${factures.length > 1 ? 's sont' : ' est'} actuellement en retard de paiement, pour un total de <strong>${formatEur(totalTtc)}</strong> TTC.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead>
        <tr>
          <th style="padding:8px 0;border-bottom:2px solid #d4e4d4;font-size:12px;color:#6b8a6b;text-align:left;">Référence</th>
          <th style="padding:8px 0;border-bottom:2px solid #d4e4d4;font-size:12px;color:#6b8a6b;text-align:left;">Client</th>
          <th style="padding:8px 0;border-bottom:2px solid #d4e4d4;font-size:12px;color:#6b8a6b;text-align:right;">Montant</th>
          <th style="padding:8px 0;border-bottom:2px solid #d4e4d4;font-size:12px;color:#6b8a6b;text-align:right;">Retard</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${restantes}`;

  const html = wrapHtml({
    title: 'Factures en retard',
    preheader: `${factures.length} factures en retard - ${formatEur(totalTtc)}`,
    headerBg: '#b91c1c',
    body,
    ctaLabel: 'Voir les factures',
    ctaHref: `${APP_URL}/facturation`,
  });

  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `SOLUVIA - ${factures.length} facture${factures.length > 1 ? 's' : ''} en retard`,
      html,
    });
    return { success: true };
  } catch (error) {
    logger.error('email.notif.factures-retard', 'Échec envoi', { to, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    };
  }
}

// ---------------------------------------------------------------------------
// 3. Fenêtre facturation - ouverture (25 du mois)
// ---------------------------------------------------------------------------

export async function sendFenetreDebutEmail(params: {
  to: string;
  prenom: string;
  nbEcheances: number;
  dateFinFenetre: string;
}): Promise<SendResult> {
  if (!resend) return { success: false, error: 'Resend non configuré' };

  const { to, prenom, nbEcheances, dateFinFenetre } = params;

  const body = `
    <h2 style="margin:0 0 16px;font-size:18px;color:#1a2e1a;">Bonjour ${prenom},</h2>
    <p style="margin:0 0 12px;color:#2d4a2d;font-size:14px;line-height:1.6;">
      La <strong>fenêtre de facturation est ouverte</strong> jusqu'au <strong>${formatDate(dateFinFenetre)}</strong>.
    </p>
    <p style="margin:0 0 12px;color:#2d4a2d;font-size:14px;line-height:1.6;">
      ${nbEcheances > 0 ? `Tu as <strong>${nbEcheances}</strong> échéance${nbEcheances > 1 ? 's' : ''} à valider.` : 'Aucune échéance en attente pour le moment.'}
    </p>`;

  const html = wrapHtml({
    title: 'Fenêtre de facturation ouverte',
    preheader: `${nbEcheances} échéances à valider`,
    headerBg: '#16a34a',
    body,
    ctaLabel: 'Aller à la facturation',
    ctaHref: `${APP_URL}/facturation`,
  });

  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'SOLUVIA - Fenêtre de facturation ouverte',
      html,
    });
    return { success: true };
  } catch (error) {
    logger.error('email.notif.fenetre-debut', 'Échec envoi', { to, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    };
  }
}

// ---------------------------------------------------------------------------
// 4. Fenêtre facturation - fermeture (2 du mois = avant-dernier jour)
// ---------------------------------------------------------------------------

export async function sendFenetreFinEmail(params: {
  to: string;
  prenom: string;
  nbEcheancesRestantes: number;
}): Promise<SendResult> {
  if (!resend) return { success: false, error: 'Resend non configuré' };

  const { to, prenom, nbEcheancesRestantes } = params;
  if (nbEcheancesRestantes === 0) return { success: true };

  const body = `
    <h2 style="margin:0 0 16px;font-size:18px;color:#1a2e1a;">Bonjour ${prenom},</h2>
    <p style="margin:0 0 12px;color:#2d4a2d;font-size:14px;line-height:1.6;">
      La <strong>fenêtre de facturation ferme demain</strong>.
    </p>
    <p style="margin:0 0 12px;color:#2d4a2d;font-size:14px;line-height:1.6;">
      Il te reste <strong>${nbEcheancesRestantes}</strong> échéance${nbEcheancesRestantes > 1 ? 's' : ''} à valider avant la clôture.
    </p>`;

  const html = wrapHtml({
    title: 'Clôture de la fenêtre de facturation',
    preheader: `${nbEcheancesRestantes} échéances restantes`,
    headerBg: '#d97706',
    body,
    ctaLabel: 'Valider mes échéances',
    ctaHref: `${APP_URL}/facturation`,
  });

  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'SOLUVIA - Dernier jour pour facturer',
      html,
    });
    return { success: true };
  } catch (error) {
    logger.error('email.notif.fenetre-fin', 'Échec envoi', { to, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    };
  }
}

// ---------------------------------------------------------------------------
// 5. Rapport mensuel (1er du mois)
// ---------------------------------------------------------------------------

export type RapportKpis = {
  moisPrecedent: string; // "mars 2026"
  productionHt: number;
  factureHt: number;
  encaisseTtc: number;
  nbFacturesEmises: number;
  nbFacturesRetard: number;
};

export async function sendRapportMensuelEmail(params: {
  to: string;
  prenom: string;
  kpis: RapportKpis;
}): Promise<SendResult> {
  if (!resend) return { success: false, error: 'Resend non configuré' };

  const { to, prenom, kpis } = params;

  const kpiRow = (label: string, value: string, accent?: string) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0f5f0;font-size:13px;color:#6b8a6b;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f0f5f0;font-size:14px;color:${accent ?? '#1a2e1a'};font-weight:600;text-align:right;">${value}</td>
    </tr>`;

  const body = `
    <h2 style="margin:0 0 16px;font-size:18px;color:#1a2e1a;">Bonjour ${prenom},</h2>
    <p style="margin:0 0 16px;color:#2d4a2d;font-size:14px;line-height:1.6;">
      Voici le récapitulatif du mois de <strong>${kpis.moisPrecedent}</strong>.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tbody>
        ${kpiRow('Production HT', formatEur(kpis.productionHt))}
        ${kpiRow('Facturé HT', formatEur(kpis.factureHt))}
        ${kpiRow('Encaissé TTC', formatEur(kpis.encaisseTtc))}
        ${kpiRow('Factures émises', String(kpis.nbFacturesEmises))}
        ${kpiRow('Factures en retard', String(kpis.nbFacturesRetard), kpis.nbFacturesRetard > 0 ? '#b91c1c' : '#1a2e1a')}
      </tbody>
    </table>`;

  const html = wrapHtml({
    title: `Rapport mensuel - ${kpis.moisPrecedent}`,
    preheader: `Production ${formatEur(kpis.productionHt)} - ${kpis.nbFacturesEmises} factures`,
    headerBg: '#0891b2',
    body,
    ctaLabel: 'Voir le dashboard',
    ctaHref: `${APP_URL}/dashboard`,
  });

  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `SOLUVIA - Rapport du mois de ${kpis.moisPrecedent}`,
      html,
    });
    return { success: true };
  } catch (error) {
    logger.error('email.notif.rapport', 'Échec envoi', { to, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    };
  }
}
