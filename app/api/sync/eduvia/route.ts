import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncAllEduviaClients } from '@/lib/eduvia/sync';
import { logger } from '@/lib/utils/logger';

// CRON: Sync contracts, learners, formations, and companies from Eduvia API
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const supabase = createAdminClient();
    const results = await syncAllEduviaClients(supabase);

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (err) {
    logger.error('eduvia_cron', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Erreur interne',
      },
      { status: 500 },
    );
  }
}
