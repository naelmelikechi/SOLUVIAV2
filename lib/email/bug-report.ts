/**
 * Envoi de l'email admin pour un bug report.
 *
 * Cette fonction part d'une ligne `bug_reports` existante (qui contient
 * deja toutes les donnees + le triage IA si effectue) et reconstruit /
 * envoie l'email. Utilisee :
 * - depuis l'API route apres `processBugReport` (envoi initial)
 * - depuis l'action `resendBugReportEmailAction` pour rejouer manuellement
 *   un email perdu (ex: probleme transient Resend, sender invalide)
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/_send';
import {
  buildBugReportEmailHtml,
  buildBugReportEmailSubject,
} from '@/lib/email/bug-report-template';
import type { Triage } from '@/lib/ai/bug-triage';
import { env } from '@/lib/env';
import { getAppUrl } from '@/lib/utils/app-url';

type AdminClient = ReturnType<typeof createAdminClient>;

async function signFor(
  admin: AdminClient,
  path: string | null,
  ttlSeconds: number,
): Promise<string | null> {
  if (!path) return null;
  const signed = await admin.storage
    .from('bug-screenshots')
    .createSignedUrl(path, ttlSeconds);
  return signed.data?.signedUrl ?? null;
}

export async function sendBugReportEmail(bugId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const admin = createAdminClient();

  const { data: bug, error } = await admin
    .from('bug_reports')
    .select('*')
    .eq('id', bugId)
    .single();

  if (error || !bug) {
    return { success: false, error: 'Bug introuvable' };
  }

  const [autoUrl, extraUrl] = await Promise.all([
    signFor(admin, bug.auto_screenshot_path, 7 * 24 * 3600),
    signFor(admin, bug.extra_screenshot_path, 7 * 24 * 3600),
  ]);

  // Fallback legacy : si ni auto ni extra, mais screenshot_path existe,
  // on l'utilise en "auto" pour l'affichage.
  const fallbackAutoUrl =
    !autoUrl && !extraUrl && bug.screenshot_path
      ? await signFor(admin, bug.screenshot_path, 7 * 24 * 3600)
      : null;

  const triage: Triage | null =
    bug.ai_status === 'done' &&
    bug.ai_severity &&
    bug.ai_category &&
    bug.ai_summary
      ? {
          severity: bug.ai_severity as Triage['severity'],
          category: bug.ai_category as Triage['category'],
          summary: bug.ai_summary,
          hypotheses: Array.isArray(bug.ai_hypotheses)
            ? (bug.ai_hypotheses as string[])
            : [],
        }
      : null;

  const appUrl = getAppUrl();
  const dashboardUrl = `${appUrl}/admin/bugs/${bug.ref}`;

  const html = buildBugReportEmailHtml({
    ref: bug.ref ?? 'BUG-?',
    comment: bug.comment,
    perceivedSeverity: bug.perceived_severity,
    userEmail: bug.user_email,
    userRole: bug.user_role,
    pageUrl: bug.page_url,
    userAgent: bug.user_agent,
    viewport: (bug.viewport ?? null) as {
      width?: number;
      height?: number;
      dpr?: number;
    } | null,
    consoleErrors: bug.console_errors,
    sentryEventId: bug.sentry_event_id,
    autoScreenshotUrl: autoUrl ?? fallbackAutoUrl,
    extraScreenshotUrl: extraUrl,
    triage,
    aiError: bug.ai_error,
    dashboardUrl,
  });

  const subject = buildBugReportEmailSubject({
    ref: bug.ref ?? 'BUG-?',
    triage,
    comment: bug.comment,
  });

  const adminEmail = env.ADMIN_BUG_REPORT_EMAIL ?? 'naelmelikechi7@gmail.com';

  const result = await sendEmail({
    from: 'SOLUVIA Bugs <contact@mysoluvia.com>',
    to: adminEmail,
    subject,
    html,
  });

  return result.success
    ? { success: true }
    : { success: false, error: result.error ?? 'Resend a refuse l envoi' };
}
