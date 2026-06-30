import { NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { timingSafeStrEqual } from '@/lib/utils/secure-compare';
import { logger } from '@/lib/utils/logger';
import {
  downloadSignedDocument,
  yousignProvider,
} from '@/lib/signature/yousign';
import type { Database } from '@/types/database';

// Webhook Yousign (signature électronique v3) — Feature 5.
//
// Yousign POST un event JSON à chaque changement d'état d'une Signature
// Request. On retrouve la demande locale par `provider_request_id`, on met à
// jour son statut (yousignProvider.mapStatus) et on dépose la preuve signée
// quand la signature est complète.
//
// Sécurité : HMAC SHA-256 sur le body BRUT, header `x-yousign-signature-256`
// au format `sha256=<hex>`, secret partagé via YOUSIGN_WEBHOOK_SECRET. La
// vérification n'est active que si le secret est configuré.
//
// Bonnes pratiques Yousign : répondre 2xx rapidement et rester idempotent.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const SCOPE = 'webhook.yousign';
const BUCKET = 'signature-documents';

interface YousignEvent {
  event_id?: string;
  event_name?: string;
  data?: {
    signature_request?: { id?: string; status?: string };
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  const secret = process.env.YOUSIGN_WEBHOOK_SECRET;
  // Fail-closed : sans secret configure, on refuse (comme linkedin/bank-lines/
  // odoo). Auparavant un secret absent => webhook traite sans authentification.
  if (!secret) {
    logger.error(SCOPE, 'YOUSIGN_WEBHOOK_SECRET absent : webhook refuse');
    return NextResponse.json(
      { error: 'Webhook non configure' },
      { status: 503 },
    );
  }
  const provided = request.headers.get('x-yousign-signature-256');
  const expected = `sha256=${createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')}`;
  if (!timingSafeStrEqual(provided, expected)) {
    logger.warn(SCOPE, 'Signature de webhook invalide');
    return NextResponse.json({ error: 'Signature invalide' }, { status: 401 });
  }

  let event: YousignEvent;
  try {
    event = JSON.parse(rawBody) as YousignEvent;
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 });
  }

  const sr = event.data?.signature_request;
  const providerRequestId = sr?.id;
  const providerStatus = sr?.status;
  if (!providerRequestId || !providerStatus) {
    // Event sans Signature Request exploitable (p. ex. contact.created) : on acquitte.
    return NextResponse.json({ success: true, action: 'ignored' });
  }

  const statut = yousignProvider.mapStatus(providerStatus);

  const supabase = createAdminClient();
  const { data: demande } = await supabase
    .from('signature_requests')
    .select('id, prospect_id, statut')
    .eq('provider', 'yousign')
    .eq('provider_request_id', providerRequestId)
    .maybeSingle();
  if (!demande) {
    logger.info(SCOPE, 'Signature request locale introuvable', {
      providerRequestId,
    });
    return NextResponse.json({ success: true, action: 'noop' });
  }

  // Ne pas régresser un état terminal (un event signataire peut arriver après
  // la complétion de la demande).
  const dejaTermine =
    demande.statut === 'signee' ||
    demande.statut === 'refusee' ||
    demande.statut === 'expiree' ||
    demande.statut === 'annulee';
  if (dejaTermine && statut === 'envoyee') {
    return NextResponse.json({ success: true, action: 'noop_terminal' });
  }

  const update: Database['public']['Tables']['signature_requests']['Update'] = {
    statut,
  };

  if (statut === 'signee') {
    update.signed_at = new Date().toISOString();
    try {
      const blob = await downloadSignedDocument(providerRequestId);
      const path = `${demande.prospect_id}/signe-${Date.now()}-yousign.pdf`;
      const buffer = Buffer.from(await blob.arrayBuffer());
      const { error: upError } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, {
          contentType: 'application/pdf',
          upsert: true,
        });
      if (upError) {
        logger.error(SCOPE, 'Dépôt de la preuve signée échoué', { upError });
      } else {
        update.signed_document_path = path;
      }
    } catch (err) {
      // La preuve reste récupérable plus tard : on ne bloque pas la maj statut.
      logger.error(SCOPE, err, { providerRequestId });
    }
  }

  const { error } = await supabase
    .from('signature_requests')
    .update(update)
    .eq('id', demande.id);
  if (error) {
    logger.error(SCOPE, 'Mise à jour du statut échouée', {
      error,
      id: demande.id,
    });
    return NextResponse.json({ error: 'Mise à jour échouée' }, { status: 500 });
  }

  return NextResponse.json({ success: true, statut });
}
