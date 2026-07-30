import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchFinalizedFiches } from '@/lib/process/source';
import { embedMany } from '@/lib/process/embeddings';
import { syncProcessIndex } from '@/lib/process/sync';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

// Synchro quotidienne des process finalisés depuis Soluvia-Process (vercel.json).
// Auth Bearer CRON_SECRET. Ne vide jamais l'index si la source est injoignable.
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  if (!env.PROCESS_SOURCE_URL) {
    return NextResponse.json(
      { ok: false, error: 'source_not_configured' },
      { status: 500 },
    );
  }

  try {
    const result = await syncProcessIndex({
      fetchSource: fetchFinalizedFiches,
      embedMany,
      admin: createAdminClient(),
      sourceBaseUrl: env.PROCESS_SOURCE_URL,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error(
      '[cron/process-sync] échec:',
      e instanceof Error ? e.message : String(e),
    );
    return NextResponse.json(
      { ok: false, error: 'sync_failed' },
      { status: 500 },
    );
  }
}
