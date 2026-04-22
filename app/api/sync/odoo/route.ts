import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncOdoo } from '@/lib/odoo/sync';
import { logger } from '@/lib/utils/logger';

// CRON: Push invoices to Odoo, pull payment statuses
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const supabase = createAdminClient();
    const results = await syncOdoo(supabase);

    return NextResponse.json({
      success: true,
      pushed: results.pushed,
      pulled: results.pulled,
      errors: results.errors,
    });
  } catch (err) {
    logger.error('api.sync.odoo', err);
    return NextResponse.json(
      { success: false, error: 'Odoo sync failed' },
      { status: 500 },
    );
  }
}
