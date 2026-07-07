// Envoi d'emails transactionnels via l'API Resend (serveur uniquement).
// La clé n'est pas NEXT_PUBLIC : jamais exposée au client.
import type { RecapModel } from '@/lib/crm/domain/recap';
import { env } from '@/lib/env';

const RESEND_API_KEY = env.RESEND_API_KEY;
const RESEND_FROM =
  process.env.RESEND_FROM || 'Soluvia <noreply@mysoluvia.com>';
// Base absolue pour les images de l'email (les clients mail exigent des URLs absolues).
const SITE = (env.NEXT_PUBLIC_SITE_URL || 'https://app.mysoluvia.com').replace(
  /\/$/,
  '',
);

/** Échappe les valeurs interpolées dans le HTML des emails (anti-injection). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  bcc?: string | string[],
): Promise<void> {
  if (!RESEND_API_KEY)
    throw new Error("RESEND_API_KEY manquante - envoi d'email impossible.");
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to,
      subject,
      html,
      ...(bcc && bcc.length ? { bcc } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Resend ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
}

/** Coquille de mail brandée (header logo Perf + footer). `bodyHtml` = contenu déjà échappé. */
function brandedShell(opts: {
  title: string;
  preheader?: string;
  bodyHtml: string;
}): string {
  const pre = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opts.preheader)}</div>`
    : '';
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f5f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#102D3A">
  ${pre}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f8;padding:32px 12px"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8ea;border-radius:14px;overflow:hidden">
      <tr><td style="background:#0B1220;padding:22px 32px;text-align:center">
        <img src="${SITE}/logo.png" width="34" height="34" alt="Soluvia" style="display:inline-block;vertical-align:middle;border:0" />
      </td></tr>
      <tr><td style="padding:32px">
        <h1 style="margin:0 0 20px;font-size:18px;font-weight:700;color:#102D3A">${escapeHtml(opts.title)}</h1>
        ${opts.bodyHtml}
      </td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:11px;color:#8AA0A8">Pipeline commercial &#183; Perf</p>
  </td></tr></table></body></html>`;
}

/** Email d'identifiants : nouveau compte (kind=invite) ou réinitialisation (kind=reset). */
export function credentialsEmail(opts: {
  kind: 'invite' | 'reset';
  name: string;
  email: string;
  password: string;
}) {
  const loginUrl = `${SITE}/login`;
  const isInvite = opts.kind === 'invite';
  const intro = isInvite
    ? 'Votre compte sur le CRM Soluvia est prêt. Connectez-vous avec les identifiants ci-dessous.'
    : 'Votre mot de passe a été réinitialisé. Connectez-vous avec le mot de passe temporaire ci-dessous.';
  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#5A7A85">${intro}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f8;border:1px solid #e2e8ea;border-radius:10px;margin:0 0 22px"><tr><td style="padding:16px 18px">
      <p style="margin:0 0 4px;font-size:12px;color:#8AA0A8">Email</p>
      <p style="margin:0 0 14px;font-size:14px;font-weight:600;color:#102D3A">${escapeHtml(opts.email)}</p>
      <p style="margin:0 0 4px;font-size:12px;color:#8AA0A8">Mot de passe temporaire</p>
      <p style="margin:0;font-size:18px;font-weight:700;letter-spacing:1px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#102D3A">${escapeHtml(opts.password)}</p>
    </td></tr></table>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#4F46E5">
      <a href="${loginUrl}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">Se connecter</a>
    </td></tr></table>
    <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#8AA0A8">Pour votre sécurité, changez ce mot de passe temporaire dès votre connexion, dans « Mon compte ».</p>`;
  return {
    subject: isInvite
      ? 'Votre accès au CRM Perf'
      : 'Votre mot de passe CRM a été réinitialisé',
    html: brandedShell({
      title: isInvite
        ? `Bienvenue${opts.name ? `, ${opts.name}` : ''}`
        : 'Mot de passe réinitialisé',
      preheader: isInvite
        ? "Vos identifiants d'accès au CRM."
        : 'Nouveau mot de passe temporaire.',
      bodyHtml,
    }),
  };
}

const MUTED = '#5A7A85';
const INK = '#102D3A';

function recapSection(title: string, inner: string): string {
  if (!inner) return '';
  return `<h2 style="margin:26px 0 10px;font-size:14px;font-weight:700;color:${INK}">${title}</h2>${inner}`;
}

function recapLines(rows: string[]): string {
  if (rows.length === 0) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows
    .map(
      (r) =>
        `<tr><td style="padding:7px 0;border-bottom:1px solid #eef2f3;font-size:13px;line-height:1.5;color:${INK}">${r}</td></tr>`,
    )
    .join('')}</table>`;
}

/** Construit le HTML + le sujet du récap à partir du modèle agrégé. */
export function recapEmail(m: RecapModel): { subject: string; html: string } {
  const kpi = (label: string, value: string | number, alert = false) =>
    `<td width="25%" style="padding:12px 8px;text-align:center;background:#f5f7f8;border:1px solid #e2e8ea;border-radius:10px">
      <div style="font-size:22px;font-weight:700;color:${alert ? '#B45309' : INK}">${value}</div>
      <div style="font-size:11px;color:${MUTED};margin-top:2px">${label}</div>
    </td>`;
  const kpiStrip = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:6px 0"><tr>
    ${kpi('Apprentis pipeline', m.kpis.apprentis)}
    ${kpi('Opp. ouvertes', m.kpis.ouvertes)}
    ${kpi('Conversion', `${m.kpis.conversion}%`)}
    ${kpi('Relances dues', m.kpis.relancesDues, m.kpis.relancesDues > 0)}
  </tr></table>`;

  const relLine = (r: RecapModel['relancesEnRetard'][number]) =>
    `<strong>${escapeHtml(r.titre)}</strong>${r.compte ? ` · ${escapeHtml(r.compte)}` : ''} <span style="color:${MUTED}">· ${escapeHtml(r.echeance)}${r.assignee ? ` · ${escapeHtml(r.assignee)}` : ''}</span>`;
  const rdvLine = (r: RecapModel['rdvAvenir'][number]) =>
    `<strong>${escapeHtml(r.titre)}</strong>${r.compte ? ` · ${escapeHtml(r.compte)}` : ''} <span style="color:${MUTED}">· ${escapeHtml(r.quand)}${r.commerciaux ? ` · ${escapeHtml(r.commerciaux)}` : ''}</span>`;
  const dormLine = (d: RecapModel['dormantes'][number]) =>
    `<strong>${escapeHtml(d.intitule)}</strong>${d.compte ? ` · ${escapeHtml(d.compte)}` : ''} <span style="color:${MUTED}">· sans action depuis ${d.joursInactif} j${d.owner ? ` · ${escapeHtml(d.owner)}` : ''}</span>`;
  const oppMini = (o: RecapModel['delta']['gagnees'][number]) =>
    `${escapeHtml(o.intitule)}${o.compte ? ` · ${escapeHtml(o.compte)}` : ''}${o.motif ? ` <span style="color:${MUTED}">(${escapeHtml(o.motif)})</span>` : ''}`;

  const urgentInner =
    recapLines([
      ...m.relancesEnRetard.map((r) => `🔴 ${relLine(r)}`),
      ...m.relancesAujourdhui.map((r) => `🟡 ${relLine(r)}`),
    ]) +
    (m.rdvAvenir.length
      ? `<div style="margin-top:8px">${recapLines(m.rdvAvenir.map(rdvLine))}</div>`
      : '');

  const risqueInner =
    (m.dormantes.length ? recapLines(m.dormantes.map(dormLine)) : '') +
    (m.rdvADebriefer.length
      ? `<div style="margin-top:8px">${recapLines(m.rdvADebriefer.map((r) => `📝 ${rdvLine(r)} · <em>compte-rendu manquant</em>`))}</div>`
      : '');

  const deltaBits: string[] = [];
  if (m.delta.nouvelles)
    deltaBits.push(`${m.delta.nouvelles} nouvelle(s) opportunité(s)`);
  if (m.delta.gagnees.length)
    deltaBits.push(`${m.delta.gagnees.length} gagnée(s)`);
  if (m.delta.perdues.length)
    deltaBits.push(`${m.delta.perdues.length} perdue(s)`);
  if (m.delta.activites)
    deltaBits.push(`${m.delta.activites} activité(s) loggée(s)`);
  if (m.delta.rdvRealises)
    deltaBits.push(`${m.delta.rdvRealises} RDV réalisé(s)`);
  if (m.delta.relancesFaites)
    deltaBits.push(`${m.delta.relancesFaites} relance(s) bouclée(s)`);
  const deltaInner =
    (deltaBits.length
      ? `<p style="margin:0 0 8px;font-size:13px;color:${INK}">${deltaBits.join(' · ')}</p>`
      : '') +
    (m.delta.gagnees.length
      ? recapLines(m.delta.gagnees.map((o) => `✅ ${oppMini(o)}`))
      : '') +
    (m.delta.perdues.length
      ? recapLines(m.delta.perdues.map((o) => `❌ ${oppMini(o)}`))
      : '');

  const funnelInner = m.funnel.length
    ? recapLines(
        m.funnel.map(
          (f) =>
            `${escapeHtml(f.libelle)} <span style="color:${MUTED}">· ${f.count}</span>`,
        ),
      )
    : '';
  const commInner = m.parCommercial.length
    ? recapLines(
        m.parCommercial.map(
          (c) =>
            `${escapeHtml(c.nom)} <span style="color:${MUTED}">· ${c.ouvertes} opp. · ${c.apprentis} apprentis</span>`,
        ),
      )
    : '';

  const nothing =
    m.relancesEnRetard.length +
      m.relancesAujourdhui.length +
      m.rdvAvenir.length +
      m.dormantes.length +
      m.rdvADebriefer.length ===
    0;

  const bodyHtml = `
    <p style="margin:0 0 18px;font-size:13px;color:${MUTED}">Période couverte : ${escapeHtml(m.periodeLabel)}</p>
    ${kpiStrip}
    ${nothing ? `<p style="margin:22px 0 0;font-size:13px;color:${MUTED}">Rien d'urgent à signaler sur cette période. 🎉</p>` : ''}
    ${recapSection('🔴 À traiter maintenant', urgentInner)}
    ${recapSection('🟠 Signaux de risque', risqueInner)}
    ${recapSection('🟢 Depuis le dernier récap', deltaInner)}
    ${recapSection('Répartition du pipeline', funnelInner)}
    ${recapSection('Par commercial', commInner)}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:26px"><tr><td style="border-radius:10px;background:#4F46E5">
      <a href="${SITE}/crm/dashboard" style="display:inline-block;padding:11px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">Ouvrir le CRM</a>
    </td></tr></table>
    <p style="margin:20px 0 0;font-size:11px;line-height:1.6;color:#8AA0A8">Récap automatique · lundi, mercredi & vendredi.</p>`;

  const preheader = `${m.kpis.relancesDues} relance(s) due(s) · ${m.rdvAvenir.length} RDV à venir · ${m.dormantes.length} opp. dormante(s)`;
  return {
    subject: `Récap commercial · ${m.periodeLabel}`,
    html: brandedShell({ title: 'Récap commercial', preheader, bodyHtml }),
  };
}
