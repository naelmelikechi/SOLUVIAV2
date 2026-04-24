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

    // Resend - email sending, optional (emails skipped if missing)
    RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required').optional(),

    // Giphy - team chat GIF search, optional (GIF search disabled if missing)
    GIPHY_API_KEY: z.string().min(1, 'GIPHY_API_KEY is required').optional(),

    // Avatar freeze unlock secret - easter egg. When avatar is frozen, users
    // must type this 20-char string to go back to daily/random mode. No hint
    // exists; impossible to guess by design. If unset, frozen is truly permanent.
    AVATAR_UNLOCK_SECRET: z.string().min(1).optional(),

    // Sentry - error tracking, no-op if DSN missing (feature-flagged init)
    SENTRY_DSN: z.string().url().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),

    // Upstash Redis - rate limiting for auth endpoints. If either var is
    // missing, rate limiting is disabled (fail-open for availability).
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

    // Runtime
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),

    // Skip fail-fast checks for prod-required vars during `next build`
    // (build time has no DB/cron/email, so requiring them would break CI).
    NEXT_PHASE: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // In production runtime (not at build), require the secrets that gate
    // security-critical features. Fail-fast at boot rather than silently
    // degrading (e.g. storing API keys in plaintext).
    const isBuild =
      data.NEXT_PHASE === 'phase-production-build' ||
      process.env.NEXT_PHASE === 'phase-production-build';
    if (data.NODE_ENV !== 'production' || isBuild) return;

    const required: Array<keyof typeof data> = [
      'SUPABASE_SERVICE_ROLE_KEY',
      'CRON_SECRET',
      'ENCRYPTION_KEY',
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
    RESEND_API_KEY: process.env.RESEND_API_KEY?.trim(),
    GIPHY_API_KEY: process.env.GIPHY_API_KEY?.trim(),
    AVATAR_UNLOCK_SECRET: process.env.AVATAR_UNLOCK_SECRET?.trim(),
    SENTRY_DSN: process.env.SENTRY_DSN?.trim(),
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN?.trim(),
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL?.trim(),
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
    NODE_ENV: process.env.NODE_ENV?.trim(),
    NEXT_PHASE: process.env.NEXT_PHASE?.trim(),
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
