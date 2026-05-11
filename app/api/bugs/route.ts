import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { triageBugReport } from '@/lib/ai/bug-triage';
import { sendEmail } from '@/lib/email/_send';
import {
  buildBugReportEmailHtml,
  buildBugReportEmailSubject,
} from '@/lib/email/bug-report-template';
import { env } from '@/lib/env';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const MAX_COMMENT = 5000;

const PayloadSchema = z.object({
  comment: z.string().min(20).max(MAX_COMMENT),
  perceivedSeverity: z.enum(['genant', 'bloquant', 'critique']).nullable(),
  pageUrl: z.string().url().max(2000),
  userAgent: z.string().max(500).nullable(),
  viewport: z
    .object({
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      dpr: z.number().positive().optional(),
    })
    .nullable(),
  consoleErrors: z.array(z.unknown()).max(20).nullable(),
  sentryEventId: z.string().max(100).nullable(),
});

type Payload = z.infer<typeof PayloadSchema>;

function getAppUrl(): string {
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  if (env.VERCEL_ENV === 'production') return 'https://app.mysoluvia.com';
  return 'http://localhost:3000';
}

function validateScreenshot(file: unknown): NextResponse | null {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_SCREENSHOT_BYTES) {
    return NextResponse.json(
      { error: 'Screenshot trop volumineux (max 5 Mo)' },
      { status: 400 },
    );
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: 'Format de screenshot non supporté' },
      { status: 400 },
    );
  }
  return null;
}

async function uploadScreenshot(
  admin: ReturnType<typeof createAdminClient>,
  file: File,
  userId: string,
  bugId: string,
  kind: 'auto' | 'extra',
): Promise<string | null> {
  const ext =
    file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
  const path = `${userId}/${bugId}-${kind}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage
    .from('bug-screenshots')
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });
  if (error) {
    logger.warn('bug-report', `Upload ${kind} screenshot échoué`, {
      bugId,
      error,
    });
    return null;
  }
  return path;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('email, role')
    .eq('id', authUser.id)
    .single();

  if (!userRow) {
    return NextResponse.json({ error: 'User not found' }, { status: 403 });
  }

  const rl = await checkRateLimit('bug-report', authUser.id, {
    limit: 5,
    windowSeconds: 3600,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Trop de signalements, réessayez plus tard.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const payloadRaw = formData.get('payload');
  if (typeof payloadRaw !== 'string') {
    return NextResponse.json({ error: 'Payload manquant' }, { status: 400 });
  }
  let payload: Payload;
  try {
    payload = PayloadSchema.parse(JSON.parse(payloadRaw));
  } catch (err) {
    return NextResponse.json(
      { error: 'Payload invalide', details: String(err) },
      { status: 400 },
    );
  }

  const autoFile = formData.get('auto_screenshot');
  const extraFile = formData.get('extra_screenshot');
  const autoErr = validateScreenshot(autoFile);
  if (autoErr) return autoErr;
  const extraErr = validateScreenshot(extraFile);
  if (extraErr) return extraErr;

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    logger.error('bug-report', 'SUPABASE_SERVICE_ROLE_KEY manquant');
    return NextResponse.json(
      { error: 'Service indisponible' },
      { status: 503 },
    );
  }

  const admin = createAdminClient();

  const { data: inserted, error: insertError } = await admin
    .from('bug_reports')
    .insert({
      user_id: authUser.id,
      user_email: userRow.email ?? authUser.email ?? 'unknown',
      user_role: userRow.role ?? 'unknown',
      comment: payload.comment,
      perceived_severity: payload.perceivedSeverity,
      page_url: payload.pageUrl,
      user_agent: payload.userAgent,
      viewport: payload.viewport as never,
      console_errors: (payload.consoleErrors ?? null) as never,
      sentry_event_id: payload.sentryEventId,
      ai_status: env.OPENAI_API_KEY ? 'pending' : 'skipped',
    })
    .select('id, ref')
    .single();

  if (insertError || !inserted) {
    logger.error('bug-report', 'Insert échoué', { error: insertError });
    return NextResponse.json(
      { error: 'Échec création du report' },
      { status: 500 },
    );
  }

  // Upload des screenshots en parallèle
  const [autoPath, extraPath] = await Promise.all([
    autoFile instanceof File && autoFile.size > 0
      ? uploadScreenshot(admin, autoFile, authUser.id, inserted.id, 'auto')
      : Promise.resolve(null),
    extraFile instanceof File && extraFile.size > 0
      ? uploadScreenshot(admin, extraFile, authUser.id, inserted.id, 'extra')
      : Promise.resolve(null),
  ]);

  if (autoPath || extraPath) {
    await admin
      .from('bug_reports')
      .update({
        auto_screenshot_path: autoPath,
        extra_screenshot_path: extraPath,
        // screenshot_path conserve la "premiere" image dispo pour
        // retro-compat des lignes existantes / templates email.
        screenshot_path: autoPath ?? extraPath,
      })
      .eq('id', inserted.id);
  }

  waitUntil(
    processBugReport({
      bugId: inserted.id,
      ref: inserted.ref ?? 'BUG-?',
      payload,
      userEmail: userRow.email ?? authUser.email ?? 'unknown',
      userRole: userRow.role ?? 'unknown',
      autoScreenshotPath: autoPath,
      extraScreenshotPath: extraPath,
    }).catch((err) => {
      logger.error('bug-report', 'processBugReport échec', {
        bugId: inserted.id,
        error: err,
      });
    }),
  );

  return NextResponse.json({ ok: true, ref: inserted.ref }, { status: 200 });
}

interface ProcessParams {
  bugId: string;
  ref: string;
  payload: Payload;
  userEmail: string;
  userRole: string;
  autoScreenshotPath: string | null;
  extraScreenshotPath: string | null;
}

async function signFor(
  admin: ReturnType<typeof createAdminClient>,
  path: string | null,
  ttlSeconds: number,
): Promise<string | null> {
  if (!path) return null;
  const signed = await admin.storage
    .from('bug-screenshots')
    .createSignedUrl(path, ttlSeconds);
  return signed.data?.signedUrl ?? null;
}

async function processBugReport(p: ProcessParams) {
  const admin = createAdminClient();

  // L'IA recoit en priorite l'auto-capture (montre la page reelle) ; si
  // absente, fallback sur l'extra. Pas besoin d'envoyer les deux a l'IA.
  const aiScreenshotPath = p.autoScreenshotPath ?? p.extraScreenshotPath;
  const aiScreenshotUrl = await signFor(admin, aiScreenshotPath, 3600);

  const [autoEmailUrl, extraEmailUrl] = await Promise.all([
    signFor(admin, p.autoScreenshotPath, 7 * 24 * 3600),
    signFor(admin, p.extraScreenshotPath, 7 * 24 * 3600),
  ]);

  let triage = null as Awaited<ReturnType<typeof triageBugReport>> | null;
  let aiError: string | null = null;
  let aiStatus: 'done' | 'failed' | 'skipped' = 'skipped';

  if (env.OPENAI_API_KEY) {
    try {
      triage = await triageBugReport({
        comment: p.payload.comment,
        perceivedSeverity: p.payload.perceivedSeverity,
        pageUrl: p.payload.pageUrl,
        userRole: p.userRole,
        userAgent: p.payload.userAgent,
        consoleErrors: p.payload.consoleErrors,
        sentryEventId: p.payload.sentryEventId,
        screenshotUrl: aiScreenshotUrl,
      });
      aiStatus = 'done';
    } catch (err) {
      aiError = err instanceof Error ? err.message : String(err);
      aiStatus = 'failed';
      logger.warn('bug-report', 'Triage IA échec', {
        bugId: p.bugId,
        error: aiError,
      });
    }
  }

  await admin
    .from('bug_reports')
    .update({
      ai_status: aiStatus,
      ai_severity: triage?.severity ?? null,
      ai_category: triage?.category ?? null,
      ai_summary: triage?.summary ?? null,
      ai_hypotheses: triage?.hypotheses ?? null,
      ai_error: aiError,
      ai_processed_at: new Date().toISOString(),
    })
    .eq('id', p.bugId);

  const adminEmail = env.ADMIN_BUG_REPORT_EMAIL ?? 'naelmelikechi7@gmail.com';
  const appUrl = getAppUrl();
  const dashboardUrl = `${appUrl}/admin/bugs/${p.ref}`;

  const html = buildBugReportEmailHtml({
    ref: p.ref,
    comment: p.payload.comment,
    perceivedSeverity: p.payload.perceivedSeverity,
    userEmail: p.userEmail,
    userRole: p.userRole,
    pageUrl: p.payload.pageUrl,
    userAgent: p.payload.userAgent,
    viewport: p.payload.viewport,
    consoleErrors: p.payload.consoleErrors,
    sentryEventId: p.payload.sentryEventId,
    autoScreenshotUrl: autoEmailUrl,
    extraScreenshotUrl: extraEmailUrl,
    triage,
    aiError,
    dashboardUrl,
  });

  const subject = buildBugReportEmailSubject({
    ref: p.ref,
    triage,
    comment: p.payload.comment,
  });

  await sendEmail({
    from: 'SOLUVIA Bugs <bugs@app.mysoluvia.com>',
    to: adminEmail,
    subject,
    html,
  });
}
