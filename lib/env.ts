import { z } from 'zod';

/**
 * Validated environment variables.
 *
 * Fail-fast at build/startup: if any required variable is missing or invalid,
 * the process throws with a descriptive Zod error instead of crashing at runtime
 * deep inside a query or auth handler.
 *
 * Usage:
 *   import { env } from '@/lib/env';
 *   const url = env.NEXT_PUBLIC_SUPABASE_URL;
 *
 * Never use `process.env.X!` directly - always go through this module.
 */

const serverSchema = z
  .object({
    // Supabase - required everywhere
    NEXT_PUBLIC_SUPABASE_URL: z.string().url({
      message: 'NEXT_PUBLIC_SUPABASE_URL must be a valid URL',
    }),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z
      .string()
      .min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),

    // Service role - server-only, required at runtime for CRON + admin ops.
    // Optional at build time (no DB access during build), required in prod runtime.
    SUPABASE_SERVICE_ROLE_KEY: z
      .string()
      .min(1, 'SUPABASE_SERVICE_ROLE_KEY is required for admin operations')
      .optional(),

    // CRON auth - required in prod, optional locally
    CRON_SECRET: z
      .string()
      .min(16, 'CRON_SECRET must be at least 16 chars')
      .optional(),

    // Encryption - required in prod to protect tenant API keys at rest.
    // No plaintext fallback: missing key means the feature is disabled, not silently insecure.
    ENCRYPTION_KEY: z
      .string()
      .min(32, 'ENCRYPTION_KEY must be at least 32 chars')
      .optional(),

    // Odoo JSON-RPC - push factures + sync paiements. Optionnel en dev/test
    // (fallback stub, cf. lib/odoo/client.ts), requis en prod : le stub
    // persisterait de faux odoo_id comptables.
    ODOO_URL: z
      .string()
      .url({ message: 'ODOO_URL must be a valid URL' })
      .optional(),
    ODOO_DB: z.string().min(1, 'ODOO_DB is required').optional(),
    ODOO_USERNAME: z.string().min(1, 'ODOO_USERNAME is required').optional(),
    ODOO_API_KEY: z.string().min(1, 'ODOO_API_KEY is required').optional(),

    // Webhook Odoo move-cancelled - optionnel, la route repond 503 si absent
    // (le cron horaire sert de filet).
    ODOO_WEBHOOK_SECRET: z.string().min(1).optional(),

    // URL publique du site - redirectTo Supabase Auth, metadataBase,
    // robots/sitemap. Optionnel hors prod (fallback getAppUrl()), requis
    // en prod pour ne jamais rediriger vers localhost.
    NEXT_PUBLIC_SITE_URL: z
      .string()
      .url({ message: 'NEXT_PUBLIC_SITE_URL must be a valid URL' })
      .optional(),

    // Resend - email sending, optional (emails skipped if missing)
    RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required').optional(),

    // Email override - quand defini, tous les emails sortants sont rediriges
    // vers cette adresse (sujet prefixe par "[DEMO -> original@x]"). Sert
    // pour le mode demo / staging. Ne JAMAIS positionner en prod reelle.
    EMAIL_OVERRIDE: z.string().email().optional(),

    // Giphy - team chat GIF search, optional (GIF search disabled if missing)
    GIPHY_API_KEY: z.string().min(1, 'GIPHY_API_KEY is required').optional(),

    // Avatar freeze unlock secret - easter egg. When avatar is frozen, users
    // must type this 20-char string to go back to daily/random mode. No hint
    // exists; impossible to guess by design. If unset, frozen is truly permanent.
    AVATAR_UNLOCK_SECRET: z.string().min(1).optional(),

    // Sentry - error tracking, no-op if DSN missing (feature-flagged init)
    SENTRY_DSN: z.string().url().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),

    // OpenAI - bug report triage (vision-capable). Optional: si absent,
    // le bug report est cree et envoye en email mais sans synthese IA
    // (ai_status = 'skipped').
    OPENAI_API_KEY: z.string().min(1).optional(),

    // Pont recherche process (source Soluvia-Process). Optionnels en dev/test,
    // requis en prod pour le cron de synchro.
    PROCESS_SYNC_SECRET: z
      .string()
      .min(16, 'PROCESS_SYNC_SECRET must be at least 16 chars')
      .optional(),
    PROCESS_SOURCE_URL: z
      .string()
      .url({ message: 'PROCESS_SOURCE_URL must be a valid URL' })
      .optional(),

    // Destinataire des emails de bug reports. Si absent, fallback vers
    // l'admin principal (cf. lib/email/notifications.ts patterns).
    ADMIN_BUG_REPORT_EMAIL: z.string().email().optional(),

    // Compte de service Google (JSON) pour l'aperçu natif des livrables Drive.
    // Optionnel : sans lui, l'aperçu est désactivé (503) et on garde le lien externe.
    GOOGLE_SERVICE_ACCOUNT_KEY: z.string().min(1).optional(),

    // Upstash Redis - rate limiting for auth endpoints. Les noms longs
    // sont ceux auto-provisionnes par la Vercel Marketplace integration
    // (prefix "UPSTASH_REDIS_REST" applique devant les noms KV standards).
    // Si l une des deux manque, le rate limit est desactive (fail-open).
    UPSTASH_REDIS_REST_KV_REST_API_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_KV_REST_API_TOKEN: z.string().min(1).optional(),

    // Runtime
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),

    // Skip fail-fast checks for prod-required vars during `next build`
    // (build time has no DB/cron/email, so requiring them would break CI).
    NEXT_PHASE: z.string().optional(),

    // Vercel-injected env: 'production' | 'preview' | 'development'.
    // Sur Vercel, NODE_ENV vaut 'production' pour les previews ET la prod,
    // donc on gate les checks stricts sur VERCEL_ENV pour laisser un
    // preview booter meme sans tous les secrets prod configures.
    VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  })
  .superRefine((data, ctx) => {
    // Ne pas bloquer pendant `next build` (pas d'acces DB/cron/email).
    const isBuild =
      data.NEXT_PHASE === 'phase-production-build' ||
      process.env.NEXT_PHASE === 'phase-production-build';
    if (isBuild) return;

    // Sur Vercel: on exige uniquement sur la prod (pas les previews).
    // Hors Vercel (self-hosted, tests e2e): on retombe sur NODE_ENV.
    const isStrictProd = data.VERCEL_ENV
      ? data.VERCEL_ENV === 'production'
      : data.NODE_ENV === 'production';
    if (!isStrictProd) return;

    const required: Array<keyof typeof data> = [
      'SUPABASE_SERVICE_ROLE_KEY',
      'CRON_SECRET',
      'ENCRYPTION_KEY',
      'ODOO_URL',
      'ODOO_DB',
      'ODOO_USERNAME',
      'ODOO_API_KEY',
      'NEXT_PUBLIC_SITE_URL',
    ];
    for (const key of required) {
      if (!data[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required in production`,
        });
      }
    }
  });

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

/**
 * On the client, `process.env` only contains `NEXT_PUBLIC_*` vars (inlined at build time).
 * On the server, all vars are available.
 */
const isServer = typeof window === 'undefined';

type Env = z.infer<typeof serverSchema>;

function parseEnv(): Env {
  // Trim all values to prevent issues from trailing newlines in env vars
  const source = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    CRON_SECRET: process.env.CRON_SECRET?.trim(),
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY?.trim(),
    ODOO_URL: process.env.ODOO_URL?.trim(),
    ODOO_DB: process.env.ODOO_DB?.trim(),
    ODOO_USERNAME: process.env.ODOO_USERNAME?.trim(),
    ODOO_API_KEY: process.env.ODOO_API_KEY?.trim(),
    ODOO_WEBHOOK_SECRET: process.env.ODOO_WEBHOOK_SECRET?.trim(),
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL?.trim(),
    RESEND_API_KEY: process.env.RESEND_API_KEY?.trim(),
    EMAIL_OVERRIDE: process.env.EMAIL_OVERRIDE?.trim(),
    OPENAI_API_KEY: process.env.OPENAI_API_KEY?.trim(),
    PROCESS_SYNC_SECRET: process.env.PROCESS_SYNC_SECRET?.trim(),
    PROCESS_SOURCE_URL: process.env.PROCESS_SOURCE_URL?.trim(),
    ADMIN_BUG_REPORT_EMAIL: process.env.ADMIN_BUG_REPORT_EMAIL?.trim(),
    GIPHY_API_KEY: process.env.GIPHY_API_KEY?.trim(),
    AVATAR_UNLOCK_SECRET: process.env.AVATAR_UNLOCK_SECRET?.trim(),
    GOOGLE_SERVICE_ACCOUNT_KEY: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
    SENTRY_DSN: process.env.SENTRY_DSN?.trim(),
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN?.trim(),
    UPSTASH_REDIS_REST_KV_REST_API_URL:
      process.env.UPSTASH_REDIS_REST_KV_REST_API_URL?.trim(),
    UPSTASH_REDIS_REST_KV_REST_API_TOKEN:
      process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN?.trim(),
    NODE_ENV: process.env.NODE_ENV?.trim(),
    NEXT_PHASE: process.env.NEXT_PHASE?.trim(),
    VERCEL_ENV: process.env.VERCEL_ENV?.trim(),
  };

  const schema = isServer ? serverSchema : clientSchema;
  const result = schema.safeParse(source);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `[env] Invalid environment variables:\n${formatted}\n\nCheck your .env.local against .env.example.`,
    );
  }

  // Client runtime lacks server-only vars; cast is safe because consumers on
  // the client only read NEXT_PUBLIC_* fields.
  return result.data as Env;
}

export const env = parseEnv();
