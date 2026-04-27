import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncOdoo } from '@/lib/odoo/sync';
import { logger } from '@/lib/utils/logger';

export const maxDuration = 120;

// CRON: push factures + avoirs to Odoo, pull payments back.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const supabase = createAdminClient();
    const result = await syncOdoo(supabase);

    return NextResponse.json({
      success: result.errors.length === 0,
      ...result,
    });
  } catch (err) {
    logger.error('odoo_cron', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Erreur interne',
      },
      { status: 500 },
    );
  }
}
