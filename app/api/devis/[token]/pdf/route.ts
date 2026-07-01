import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { renderDevisPdfBuffer } from '@/lib/utils/render-devis-pdf';
import { mapDevisPdfPublic } from '@/lib/queries/devis';
import { logger } from '@/lib/utils/logger';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const [{ token }, supabase] = await Promise.all([params, createClient()]);

  // RPC SECURITY DEFINER : token + expiration + statut verifies cote SQL,
  // projection minimale (pas de service-role, pas d'acces direct a la table).
  const { data, error } = await supabase.rpc('get_devis_pdf_public', {
    p_token: token,
  });
  if (error || !data) {
    return NextResponse.json(
      { error: 'Lien invalide ou expiré' },
      { status: 404 },
    );
  }

  const devis = mapDevisPdfPublic(data);
  try {
    const buffer = await renderDevisPdfBuffer(devis);
    const filename = devis.ref ? `${devis.ref}.pdf` : 'devis.pdf';
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    logger.error('api.devis.pdf', 'render failed', { error: e });
    return NextResponse.json(
      { error: 'Erreur génération PDF' },
      { status: 500 },
    );
  }
}
