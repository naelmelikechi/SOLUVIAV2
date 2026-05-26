import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Endpoint d'ingestion des bank_lines miroirs depuis FINANCES-WISEMANH.
// Auth : header x-mirror-token (env BANK_LINES_MIRROR_TOKEN, partagé avec FIN).
// Idempotence : upsert sur (source_app, source_external_id).
//
// Body :
//   { entries: [{ external_id, date, montant, payment_ref, partner_name,
//                  societe_slug, raw }] }

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

interface IngestEntry {
  external_id: number;
  date: string; // YYYY-MM-DD
  montant: number;
  payment_ref?: string | null;
  partner_name?: string | null;
  societe_slug?: string | null;
  raw?: Record<string, unknown>;
}

interface IngestBody {
  entries: IngestEntry[];
}

export async function POST(request: Request) {
  const expected = process.env.BANK_LINES_MIRROR_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { success: false, error: 'BANK_LINES_MIRROR_TOKEN non configuré' },
      { status: 503 },
    );
  }
  const provided = request.headers.get('x-mirror-token');
  if (provided !== expected) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  let body: IngestBody;
  try {
    body = (await request.json()) as IngestBody;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Body JSON invalide' },
      { status: 400 },
    );
  }

  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (entries.length === 0) {
    return NextResponse.json({ success: true, upserted: 0 });
  }

  const rows = entries.map((e) => ({
    source_app: 'finances-wisemanh',
    source_external_id: e.external_id,
    date: e.date,
    montant: Number(e.montant),
    payment_ref: e.payment_ref ?? null,
    partner_name: e.partner_name ?? null,
    societe_slug: e.societe_slug ?? null,
    raw: e.raw ?? null,
    synced_at: new Date().toISOString(),
  }));

  const supabase = createAdminClient();
  // bank_lines_mirror : table créée par la migration 20260526120200_bank_lines_mirror.sql
  // mais pas encore présente dans types/database.ts (à régénérer après
  // supabase db push). Cast pour ne pas bloquer le déploiement.
  const { error } = await supabase
    .from('bank_lines_mirror' as never)
    .upsert(rows as never, { onConflict: 'source_app,source_external_id' });

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, upserted: rows.length });
}
