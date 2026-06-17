import { sendEmail } from '@/lib/email/_send';

const FROM = 'SOLUVIA <contact@mysoluvia.com>';

/**
 * Enveloppe de présentation cohérente avec les mails transactionnels Soluvia
 * (cf. wrapHtml de lib/email/notifications.ts, non exporté). `body` est un
 * fragment HTML (paragraphes) produit par getPostRdvMailDraft ou saisi par le
 * Développeur.
 */
function wrapCommercialHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background-color:#f5f7f5;">
<div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #d4e4d4;">
  <div style="background:#166534;padding:28px 32px;text-align:center;">
    <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:1px;">SOLUVIA</h1>
  </div>
  <div style="padding:32px;color:#1f2937;font-size:14px;line-height:1.6;">
    ${body}
  </div>
  <div style="background:#f0f5f0;padding:16px 32px;border-top:1px solid #d4e4d4;">
    <p style="margin:0;color:#6b8a6b;font-size:11px;text-align:center;">SOLUVIA — Plateforme de pilotage pour organismes de formation</p>
  </div>
</div></body></html>`;
}

/**
 * Envoie un mail commercial (post-RDV ou manuel) au prospect via Resend.
 * Enveloppe le corps HTML dans la présentation Soluvia et part de l'adresse
 * SOLUVIA. Renvoie un résultat uniforme `{ success, error? }`.
 */
export async function sendCommercialMail(params: {
  to: string;
  cc?: string[];
  subject: string;
  bodyHtml: string;
}): Promise<{ success: boolean; error?: string }> {
  const result = await sendEmail({
    from: FROM,
    to: params.to,
    cc: params.cc,
    subject: params.subject,
    html: wrapCommercialHtml(params.subject, params.bodyHtml),
  });
  return { success: result.success, error: result.error };
}
