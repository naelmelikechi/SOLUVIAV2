import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';

// Synergie #4 : webhook Odoo invoqué quand un account.move passe en
// state=cancel. Réduit la latence de détection vs cron horaire.
//
// Le filet de sécurité (Phase 4 du cron /api/sync/odoo) reste en place :
// si le webhook se perd, le cron rattrapera dans l'heure.
//
// Sécurité : HMAC SHA-256 sur le body brut, secret partagé via env.

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const SCOPE = 'webhook.odoo.move-cancelled';

interface WebhookPayload {
  odoo_id: number | string;
  ref?: string | null;
  write_date: string;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(request: Request) {
  const secret = process.env.ODOO_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { success: false, error: 'ODOO_WEBHOOK_SECRET non configuré' },
      { status: 503 },
    );
  }

  const signature = request.headers.get('x-odoo-signature') ?? '';
  const rawBody = await request.text();

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  if (!safeEqual(signature, expected)) {
    logger.warn(SCOPE, 'Bad signature');
    return NextResponse.json(
      { success: false, error: 'Bad signature' },
      { status: 401 },
    );
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Body JSON invalide' },
      { status: 400 },
    );
  }

  const odooId = String(payload.odoo_id);
  const supabase = createAdminClient();

  const { data: facture } = await supabase
    .from('factures')
    .select('id, ref, est_avoir')
    .eq('odoo_id', odooId)
    .maybeSingle();

  if (!facture) {
    logger.info(SCOPE, 'Facture introuvable pour move cancelled', { odooId });
    return NextResponse.json({ success: true, action: 'noop' });
  }

  if (facture.est_avoir) {
    return NextResponse.json({ success: true, action: 'skipped_avoir' });
  }

  // Skip si avoir Soluvia existe deja (déjà géré côté humain)
  const { count: avoirCount } = await supabase
    .from('factures')
    .select('id', { count: 'exact', head: true })
    .eq('facture_origine_id', facture.id)
    .eq('est_avoir', true);
  if (avoirCount && avoirCount > 0) {
    return NextResponse.json({ success: true, action: 'skipped_avoir_exists' });
  }

  // Notif admins
  const { data: admins } = await supabase
    .from('users')
    .select('id')
    .in('role', ['admin', 'superadmin'])
    .eq('actif', true);
  const adminIds = (admins ?? []).map((a) => a.id);
  const writeDate = (payload.write_date ?? '').slice(0, 10);
  const message = `⚠️ Facture ${facture.ref ?? '(sans ref)'} annulée côté Odoo le ${writeDate} (webhook). À réviser.`;
  if (adminIds.length > 0) {
    await supabase.from('notifications').insert(
      adminIds.map((adminId) => ({
        type: 'erreur_sync' as const,
        user_id: adminId,
        titre: 'Facture annulée côté Odoo',
        message,
        lien: facture.ref ? `/facturation/${facture.ref}` : null,
      })),
    );
  }

  // Fan-out vers FINANCES (best-effort, ne bloque pas la réponse)
  const financesUrl = process.env.FINANCES_WEBHOOK_URL;
  const financesToken = process.env.FINANCES_WEBHOOK_TOKEN;
  let financesStatus: 'sent' | 'skipped' | 'error' = 'skipped';
  if (financesUrl && financesToken) {
    try {
      const res = await fetch(financesUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-finances-token': financesToken,
        },
        body: rawBody,
        signal: AbortSignal.timeout(5_000),
      });
      financesStatus = res.ok ? 'sent' : 'error';
    } catch {
      financesStatus = 'error';
    }
  }

  return NextResponse.json({
    success: true,
    action: 'notified',
    finances: financesStatus,
  });
}
