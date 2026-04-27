import { Resend } from 'resend';
import { env } from '@/lib/env';
import { logger } from '@/lib/utils/logger';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

type Attachment = {
  filename: string;
  content: Buffer | string;
};

export type EmailParams = {
  from: string;
  to: string;
  subject: string;
  html: string;
  attachments?: Attachment[];
};

/**
 * Single entrypoint for all outbound Resend emails.
 *
 * Behavior:
 * - If RESEND_API_KEY missing: logs and returns `{ success: false, skipped: true }`.
 * - If EMAIL_OVERRIDE env set: redirects to that address and prefixes subject
 *   with "[DEMO -> original@x.com]". Used in staging/demo to avoid mailing
 *   real clients while still exercising the full pipeline.
 * - Otherwise: sends normally.
 */
export async function sendEmail(params: EmailParams): Promise<{
  success: boolean;
  error?: string;
  skipped?: boolean;
}> {
  if (!resend) {
    logger.warn('email', 'RESEND_API_KEY non configuré - email non envoyé', {
      to: params.to,
      subject: params.subject,
    });
    return {
      success: false,
      skipped: true,
      error: 'Service email non configuré',
    };
  }

  const override = env.EMAIL_OVERRIDE;
  const finalTo = override ?? params.to;
  const finalSubject = override
    ? `[DEMO -> ${params.to}] ${params.subject}`
    : params.subject;

  if (override) {
    logger.info('email', 'EMAIL_OVERRIDE actif - redirection', {
      original: params.to,
      override,
      subject: params.subject,
    });
  }

  try {
    await resend.emails.send({
      from: params.from,
      to: finalTo,
      subject: finalSubject,
      html: params.html,
      attachments: params.attachments,
    });
    return { success: true };
  } catch (error) {
    logger.error('email', 'Échec envoi email', {
      to: finalTo,
      subject: finalSubject,
      error,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    };
  }
}
