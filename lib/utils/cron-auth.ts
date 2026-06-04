import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/utils/logger';
import { timingSafeStrEqual } from '@/lib/utils/secure-compare';

/**
 * Validates CRON_SECRET bearer token on protected API routes.
 * Returns a NextResponse error if invalid, or null if authorized.
 */
export function verifyCronAuth(request: Request): NextResponse | null {
  const secret = env.CRON_SECRET;
  if (!secret) {
    logger.error('cron_auth', 'CRON_SECRET is not configured');
    return NextResponse.json(
      { error: 'Server misconfigured' },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;

  // Timing-safe comparison to prevent timing attacks
  if (!timingSafeStrEqual(authHeader, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
