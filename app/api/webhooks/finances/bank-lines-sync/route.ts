import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { timingSafeStrEqual } from '@/lib/utils/secure-compare';
import type { Json } from '@/types/database';

// Endpoint d'ingestion des bank_lines miroirs depuis FINANCES-WISEMANH.
// Auth : header x-mirror-token (env BANK_LINES_MIRROR_TOKEN, partagé avec FIN).
// Idempotence : upsert sur (source_app, source_external_id).
//
// Body :
//   { entries: [{ external_id, date, montant, payment_ref, partner_name,
//                  societe_slug, raw }] }

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// Validation stricte du body : l'endpoint est token-gated mais on ne fait pas
// confiance aveuglément aux données partenaire (montant NaN, dates malformées,
// payload géant). Defense en profondeur, cohérent avec les Server Actions.
const IngestEntrySchema = z.object({
  external_id: z.number().int('external_id doit être un entier').finite(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date attendue au format YYYY-MM-DD'),
  montant: z.number().finite('montant doit être un nombre fini'),
  payment_ref: z.string().nullish(),
  partner_name: z.string().nullish(),
  societe_slug: z.string().nullish(),
  raw: z.unknown().optional(),
});

const IngestBodySchema = z.object({
  entries: z.array(IngestEntrySchema).max(5000, 'Trop de lignes (max 5000)'),
});

export async function POST(request: Request) {
  const expected = process.env.BANK_LINES_MIRROR_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { success: false, error: 'BANK_LINES_MIRROR_TOKEN non configuré' },
      { status: 503 },
    );
  }
  const provided = request.headers.get('x-mirror-token');
  if (!timingSafeStrEqual(provided, expected)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Body JSON invalide' },
      { status: 400 },
    );
  }

  const parsed = IngestBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Body invalide',
      },
      { status: 400 },
    );
  }

  const entries = parsed.data.entries;
  if (entries.length === 0) {
    return NextResponse.json({ success: true, upserted: 0 });
  }

  const rows = entries.map((e) => ({
    source_app: 'finances-wisemanh',
    source_external_id: e.external_id,
    date: e.date,
    montant: e.montant,
    payment_ref: e.payment_ref ?? null,
    partner_name: e.partner_name ?? null,
    societe_slug: e.societe_slug ?? null,
    raw: (e.raw ?? null) as Json,
    synced_at: new Date().toISOString(),
  }));

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('bank_lines_mirror')
    .upsert(rows, { onConflict: 'source_app,source_external_id' });

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, upserted: rows.length });
}
