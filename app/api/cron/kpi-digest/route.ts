import { NextResponse } from 'next/server';
import { format, startOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import { sendEmail } from '@/lib/email/_send';
import { withEmailLock, isoWeekKey } from '@/lib/email/send-log';
import { getAppUrl } from '@/lib/utils/app-url';
import {
  computeCommercialKpis,
  type CommercialKpis,
} from '@/lib/queries/commercial-kpis';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const FROM = 'SOLUVIA <contact@mysoluvia.com>';

// Gabarit email SOLUVIA (aligne sur lib/email/notifications.ts).
function wrap(options: {
  title: string;
  preheader: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}): string {
  const { title, preheader, body, ctaLabel, ctaHref } = options;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background-color:#f5f7f5;">
<span style="display:none!important;color:#f5f7f5;">${preheader}</span>
<div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #d4e4d4;">
  <div style="background:#0891b2;padding:28px 32px;text-align:center;">
    <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:1px;">SOLUVIA</h1>
    <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:13px;">${title}</p>
  </div>
  <div style="padding:32px;">
    ${body}
    <div style="text-align:center;margin:24px 0 8px;">
      <a href="${ctaHref}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">${ctaLabel}</a>
    </div>
  </div>
  <div style="background:#f0f5f0;padding:16px 32px;border-top:1px solid #d4e4d4;">
    <p style="margin:0;color:#6b8a6b;font-size:11px;text-align:center;">SOLUVIA - Plateforme de pilotage pour organismes de formation</p>
  </div>
</div></body></html>`;
}

function buildDigestHtml(
  kpis: CommercialKpis,
  moisLabel: string,
  appUrl: string,
): string {
  const v = kpis.volume;
  const totalAlertes = kpis.alertes.reduce((acc, a) => acc + a.count, 0);
  const signe = kpis.funnel.find((f) => f.stage === 'signe');
  const tauxSigne =
    signe && signe.conversion !== null
      ? `${(signe.conversion * 100).toFixed(1)}%`
      : '-';

  const kpiRow = (label: string, value: string, accent?: string) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0f5f0;font-size:13px;color:#6b8a6b;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f0f5f0;font-size:14px;color:${accent ?? '#1a2e1a'};font-weight:600;text-align:right;">${value}</td>
    </tr>`;

  const tunnelRows = kpis.tunnels
    .map((t) =>
      kpiRow(
        t.label,
        `${t.signatures} sign. - ${t.volumeActif} actifs - ticket ${t.ticketMoyen}`,
      ),
    )
    .join('');

  const body = `
    <h2 style="margin:0 0 16px;font-size:18px;color:#1a2e1a;">KPI commerciaux - ${moisLabel}</h2>
    <p style="margin:0 0 16px;color:#2d4a2d;font-size:14px;line-height:1.6;">
      Synthèse hebdomadaire du pipeline commercial.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:8px 0;">
      <tbody>
        ${kpiRow('Prospects actifs', String(v.actifs))}
        ${kpiRow('Qualifiés (présenté et au-delà)', String(v.qualifies))}
        ${kpiRow('Nouveaux ce mois', `${v.nouveaux.value} (préc. ${v.nouveaux.previous})`)}
        ${kpiRow('Signatures ce mois', `${v.signatures.value} (préc. ${v.signatures.previous})`)}
        ${kpiRow('Conversion audité vers signé', tauxSigne)}
        ${kpiRow('Cycle médian', `${kpis.cycle.medianJours} j`)}
        ${kpiRow('Alertes ouvertes', String(totalAlertes), totalAlertes > 0 ? '#b91c1c' : '#1a2e1a')}
      </tbody>
    </table>
    <h3 style="margin:20px 0 8px;font-size:15px;color:#1a2e1a;">Tunnels</h3>
    <table style="width:100%;border-collapse:collapse;">
      <tbody>${tunnelRows}</tbody>
    </table>`;

  return wrap({
    title: `KPI commerciaux - ${moisLabel}`,
    preheader: `${v.signatures.value} signatures - ${v.actifs} prospects actifs`,
    body,
    ctaLabel: 'Voir le tableau de bord',
    ctaHref: `${appUrl}/commercial/kpis`,
  });
}

// CRON hebdo (lundi 9h) : snapshot KPI commerciaux mois en cours -> Direction.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const now = new Date();

  try {
    const result = await withEmailLock(
      supabase,
      'kpi-digest',
      isoWeekKey(now),
      async () => {
        const kpis = await computeCommercialKpis(
          supabase,
          { periode: 'mois' },
          now,
        );

        const { data: admins } = await supabase
          .from('users')
          .select('email, prenom')
          .in('role', ['admin', 'superadmin'])
          .eq('actif', true);

        if (!admins || admins.length === 0) {
          return { sent: 0, failed: 0, message: 'Aucun admin actif' };
        }

        const moisLabel = format(startOfMonth(now), 'MMMM yyyy', {
          locale: fr,
        });
        const html = buildDigestHtml(kpis, moisLabel, getAppUrl());
        const subject = `SOLUVIA - KPI commerciaux hebdo (${moisLabel})`;

        let sent = 0;
        let failed = 0;
        for (const admin of admins) {
          // oxlint-disable-next-line react-doctor/async-await-in-loop
          const r = await sendEmail({
            from: FROM,
            to: admin.email,
            subject,
            html,
          });
          if (r.success) sent++;
          else failed++;
        }

        logger.info('cron.kpi-digest', 'digest envoyé', { sent, failed });
        return { sent, failed };
      },
    );

    if (result === null) {
      return NextResponse.json({ success: true, skipped: true });
    }
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    logger.error('cron.kpi-digest', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
