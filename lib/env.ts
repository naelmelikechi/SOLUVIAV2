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
 * Never use `process.env.X!` directly — always go through this module.
 */

const serverSchema = z.object({
  // Supabase — required everywhere
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({
    message: 'NEXT_PUBLIC_SUPABASE_URL must be a valid URL',
  }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),

  // Service role — server-only, required at runtime for CRON + admin ops
  // Optional here so builds don't fail; validated at point of use in admin.ts
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, 'SUPABASE_SERVICE_ROLE_KEY is required for admin operations')
    .optional(),

  // CRON auth — required in prod, optional locally
  CRON_SECRET: z
    .string()
    .min(16, 'CRON_SECRET must be at least 16 chars')
    .optional(),

  // Encryption — required for API key encryption/decryption
  ENCRYPTION_KEY: z
    .string()
    .min(32, 'ENCRYPTION_KEY must be at least 32 chars')
    .optional(),

  // Resend — email sending, optional (emails skipped if missing)
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required').optional(),

  // Runtime
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/**
 * On the client, `process.env` only contains `NEXT_PUBLIC_*` vars (inlined at build time).
 * On the server, all vars are available.
 */
const isServer = typeof window === 'undefined';

type Env = z.infer<typeof serverSchema>;

function parseEnv(): Env {
  const source = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    NODE_ENV: process.env.NODE_ENV,
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
