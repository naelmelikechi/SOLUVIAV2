import { escapeHtml } from '@/lib/utils/escape-html';
import type { Triage } from '@/lib/ai/bug-triage';

const SEVERITY_COLORS: Record<string, { bg: string; fg: string }> = {
  low: { bg: '#dbeafe', fg: '#1e40af' },
  medium: { bg: '#fef3c7', fg: '#92400e' },
  high: { bg: '#fed7aa', fg: '#9a3412' },
  critical: { bg: '#fecaca', fg: '#991b1b' },
};

const SEVERITY_LABELS: Record<string, string> = {
  low: 'Faible',
  medium: 'Moyenne',
  high: 'Élevée',
  critical: 'Critique',
};

const CATEGORY_LABELS: Record<string, string> = {
  ui: 'Interface',
  data: 'Donnees',
  auth: 'Authentification',
  perf: 'Performance',
  email: 'Email',
  pdf: 'PDF',
  navigation: 'Navigation',
  permissions: 'Permissions',
  autre: 'Autre',
};

export interface BugReportEmailParams {
  ref: string;
  comment: string;
  perceivedSeverity: string | null;
  userEmail: string;
  userRole: string;
  pageUrl: string;
  userAgent: string | null;
  viewport: { width?: number; height?: number; dpr?: number } | null;
  consoleErrors: unknown;
  sentryEventId: string | null;
  autoScreenshotUrl: string | null;
  extraScreenshotUrl: string | null;
  triage: Triage | null;
  aiError: string | null;
  dashboardUrl: string;
}

export function buildBugReportEmailSubject(
  params: Pick<BugReportEmailParams, 'ref' | 'triage' | 'comment'>,
): string {
  const sevLabel = params.triage?.severity
    ? `[${params.triage.severity.toUpperCase()}]`
    : '';
  const catLabel = params.triage?.category
    ? `[${params.triage.category.toUpperCase()}]`
    : '';
  const summary = params.triage?.summary ?? params.comment.slice(0, 80);
  const cleanSummary = summary.replace(/\s+/g, ' ').trim().slice(0, 90);
  // Concat avec espace seulement si sevLabel ou catLabel est non-vide,
  // pour eviter le double-espace `[BUG-0001]  summary` quand pas de triage.
  const prefix = [`[${params.ref}]`, `${sevLabel}${catLabel}`]
    .filter(Boolean)
    .join(' ');
  return `${prefix} ${cleanSummary}`.trim();
}

export function buildBugReportEmailHtml(params: BugReportEmailParams): string {
  const ref = escapeHtml(params.ref);
  const comment = escapeHtml(params.comment).replace(/\n/g, '<br>');
  const userEmail = escapeHtml(params.userEmail);
  const userRole = escapeHtml(params.userRole);
  const pageUrl = escapeHtml(params.pageUrl);
  const userAgent = escapeHtml(params.userAgent ?? 'inconnu');
  const sentryEventId = escapeHtml(params.sentryEventId ?? '-');
  const dashboardUrl = escapeHtml(params.dashboardUrl);
  const perceivedSeverity = escapeHtml(
    params.perceivedSeverity ?? 'non précisée',
  );

  const viewportStr = params.viewport
    ? `${params.viewport.width ?? '?'} x ${params.viewport.height ?? '?'} (dpr ${params.viewport.dpr ?? '?'})`
    : 'inconnu';

  const consoleErrorsHtml =
    params.consoleErrors &&
    Array.isArray(params.consoleErrors) &&
    params.consoleErrors.length > 0
      ? `<pre style="margin:0;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;font-size:11px;font-family:monospace;white-space:pre-wrap;word-break:break-all;color:#374151;">${escapeHtml(
          JSON.stringify(params.consoleErrors, null, 2).slice(0, 4000),
        )}</pre>`
      : '<p style="margin:0;font-size:13px;color:#6b7280;">Aucune erreur JS récente capturée.</p>';

  let triageBlock = '';
  if (params.triage) {
    const severity = params.triage.severity;
    const colors = SEVERITY_COLORS[severity] ??
      SEVERITY_COLORS.medium ?? { bg: '#fef3c7', fg: '#92400e' };
    const sevLabel = SEVERITY_LABELS[severity] ?? severity;
    const catLabel =
      CATEGORY_LABELS[params.triage.category] ?? params.triage.category;
    const hypothesesHtml = params.triage.hypotheses.length
      ? `<ul style="margin:8px 0 0;padding-left:20px;font-size:14px;color:#1a1a1a;line-height:1.6;">${params.triage.hypotheses
          .map((h) => `<li style="margin-bottom:4px;">${escapeHtml(h)}</li>`)
          .join('')}</ul>`
      : '';

    triageBlock = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background-color:#fafafa;border:1px solid #e5e7eb;border-radius:6px;">
        <tr><td style="padding:16px 20px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:bold;color:#6b7280;letter-spacing:1px;text-transform:uppercase;">Analyse IA</p>
          <div style="margin:0 0 12px;">
            <span style="display:inline-block;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:bold;background:${colors.bg};color:${colors.fg};margin-right:6px;">${escapeHtml(sevLabel)}</span>
            <span style="display:inline-block;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:bold;background:#e5e7eb;color:#374151;">${escapeHtml(catLabel)}</span>
          </div>
          <p style="margin:0;font-size:14px;color:#1a1a1a;line-height:1.6;">${escapeHtml(params.triage.summary)}</p>
          ${
            hypothesesHtml
              ? `<p style="margin:12px 0 0;font-size:12px;font-weight:bold;color:#6b7280;letter-spacing:0.5px;text-transform:uppercase;">Hypothèses</p>${hypothesesHtml}`
              : ''
          }
        </td></tr>
      </table>`;
  } else if (params.aiError) {
    triageBlock = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background-color:#fef2f2;border:1px solid #fecaca;border-radius:6px;">
        <tr><td style="padding:12px 20px;">
          <p style="margin:0;font-size:13px;color:#991b1b;"><strong>Analyse IA échouée :</strong> ${escapeHtml(params.aiError)}</p>
        </td></tr>
      </table>`;
  }

  function shotBlock(url: string | null, label: string): string {
    if (!url) return '';
    const safeUrl = escapeHtml(url);
    const safeLabel = escapeHtml(label);
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr><td>
          <p style="margin:0 0 8px;font-size:12px;font-weight:bold;color:#6b7280;letter-spacing:1px;text-transform:uppercase;">${safeLabel}</p>
          <a href="${safeUrl}" style="display:inline-block;text-decoration:none;">
            <img src="${safeUrl}" alt="${safeLabel}" style="display:block;max-width:100%;border:1px solid #e5e7eb;border-radius:6px;" />
          </a>
          <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">Lien valide 7 jours - <a href="${safeUrl}" style="color:#6b7280;">ouvrir en taille réelle</a></p>
        </td></tr>
      </table>`;
  }

  const screenshotBlock =
    shotBlock(params.autoScreenshotUrl, 'Capture de la page') +
    shotBlock(
      params.extraScreenshotUrl,
      params.autoScreenshotUrl ? 'Capture supplémentaire' : 'Capture',
    );

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bug ${ref}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;max-width:640px;width:100%;">
        <tr>
          <td style="background-color:#ffffff;padding:24px 32px;border-bottom:1px solid #e5e7eb;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <img src="https://app.mysoluvia.com/logo.png" alt="SOLUVIA" width="160" height="32" style="display:block;height:32px;width:auto;border:0;" />
                </td>
                <td align="right">
                  <span style="font-size:13px;color:#6b7280;font-weight:500;">Bug report ${ref}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 32px;">
            <h1 style="margin:0 0 20px;font-size:18px;color:#1a1a1a;">Nouveau bug signalé</h1>

            ${triageBlock}

            <p style="margin:0 0 8px;font-size:12px;font-weight:bold;color:#6b7280;letter-spacing:1px;text-transform:uppercase;">Commentaire utilisateur</p>
            <div style="margin:0 0 24px;padding:14px 16px;background:#fafafa;border-left:3px solid #d1d5db;border-radius:0 4px 4px 0;font-size:14px;color:#1a1a1a;line-height:1.6;">
              ${comment}
            </div>

            ${screenshotBlock}

            <p style="margin:0 0 8px;font-size:12px;font-weight:bold;color:#6b7280;letter-spacing:1px;text-transform:uppercase;">Reporté par</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;font-size:13px;color:#1a1a1a;">
              <tr><td style="padding:3px 0;color:#6b7280;width:140px;">Utilisateur</td><td style="padding:3px 0;">${userEmail} <span style="color:#9ca3af;">(${userRole})</span></td></tr>
              <tr><td style="padding:3px 0;color:#6b7280;">Sévérité ressentie</td><td style="padding:3px 0;">${perceivedSeverity}</td></tr>
              <tr><td style="padding:3px 0;color:#6b7280;">Page</td><td style="padding:3px 0;word-break:break-all;"><a href="${pageUrl}" style="color:#2563eb;text-decoration:none;">${pageUrl}</a></td></tr>
            </table>

            <p style="margin:0 0 8px;font-size:12px;font-weight:bold;color:#6b7280;letter-spacing:1px;text-transform:uppercase;">Contexte technique</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:12px;color:#1a1a1a;">
              <tr><td style="padding:3px 0;color:#6b7280;width:140px;">User-Agent</td><td style="padding:3px 0;word-break:break-all;font-family:monospace;font-size:11px;">${userAgent}</td></tr>
              <tr><td style="padding:3px 0;color:#6b7280;">Viewport</td><td style="padding:3px 0;font-family:monospace;font-size:11px;">${viewportStr}</td></tr>
              <tr><td style="padding:3px 0;color:#6b7280;">Sentry event</td><td style="padding:3px 0;font-family:monospace;font-size:11px;">${sentryEventId}</td></tr>
            </table>

            <p style="margin:0 0 8px;font-size:12px;font-weight:bold;color:#6b7280;letter-spacing:1px;text-transform:uppercase;">Erreurs console (dernières 10)</p>
            <div style="margin:0 0 24px;">${consoleErrorsHtml}</div>

            <p style="margin:0;">
              <a href="${dashboardUrl}" style="display:inline-block;padding:10px 20px;background-color:#1a1a1a;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">Ouvrir dans le dashboard</a>
            </p>
          </td>
        </tr>

        <tr>
          <td style="background-color:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">Email automatique - bug report SOLUVIA. Ne pas répondre directement.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
