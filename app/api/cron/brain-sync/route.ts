import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchFinalizedFiches } from '@/lib/process/source';
import { env } from '@/lib/env';
import { analyzeFiche } from '@/lib/brain/claude';
import { putNote } from '@/lib/brain/github';
import { syncBrainFiches } from '@/lib/brain/sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

// Ingestion quotidienne des fiches dans le cerveau (Claude). Auth CRON_SECRET.
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  if (!env.ANTHROPIC_API_KEY)
    return NextResponse.json(
      { ok: false, error: 'ai_not_configured' },
      { status: 503 },
    );
  if (!env.PROCESS_SOURCE_URL)
    return NextResponse.json(
      { ok: false, error: 'source_not_configured' },
      { status: 500 },
    );

  try {
    const result = await syncBrainFiches({
      fetchSource: fetchFinalizedFiches,
      analyze: analyzeFiche,
      putNote,
      admin: createAdminClient(),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error(
      '[cron/brain-sync] échec:',
      e instanceof Error ? e.message : String(e),
    );
    return NextResponse.json(
      { ok: false, error: 'sync_failed' },
      { status: 500 },
    );
  }
}
