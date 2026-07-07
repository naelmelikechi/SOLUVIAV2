import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createCrmAdminClient } from '@/lib/crm/supabase/admin';
import { sendRecap, buildRecap } from '@/lib/crm/recap';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Récap commercial CRM (Lun/Mer/Ven 16:00 UTC via vercel.json). Auth Bearer
// CRON_SECRET (verifyCronAuth, timing-safe). `?dry=1` renvoie le HTML sans
// envoyer. Client service_role scopé `crm` (bypass RLS) ; anonymisation des
// comptes fantômes conservée côté lib/crm/recap.
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const sb = createCrmAdminClient();

  // Mode aperçu : renvoie le HTML sans envoyer (?dry=1).
  if (request.nextUrl.searchParams.get('dry') === '1') {
    try {
      const { subject, html } = await buildRecap(sb);
      return new NextResponse(html, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          // Encodé : le sujet contient des non-latin1 (—, →, accents) interdits en en-tête HTTP.
          'x-recap-subject': encodeURIComponent(subject),
        },
      });
    } catch (e) {
      console.error(
        '[cron/crm-recap dry] échec:',
        e instanceof Error ? e.message : String(e),
      );
      return NextResponse.json(
        { ok: false, error: 'build_failed' },
        { status: 500 },
      );
    }
  }

  try {
    const result = await sendRecap(sb, { trigger: 'cron' });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error(
      '[cron/crm-recap] échec:',
      e instanceof Error ? e.message : String(e),
    );
    return NextResponse.json(
      { ok: false, error: 'send_failed' },
      { status: 500 },
    );
  }
}
