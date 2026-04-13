import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { env } from '@/lib/env';
import { logger } from '@/lib/utils/logger';

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
  try {
    const a = Buffer.from(authHeader);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
