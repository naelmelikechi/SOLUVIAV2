import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDevisById } from '@/lib/queries/devis';
import { renderDevisPdfBuffer } from '@/lib/utils/render-devis-pdf';
import { logger } from '@/lib/utils/logger';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabase = await createClient();

  // Verifier le token + recuperer le devis_id
  const { data: row, error } = await supabase
    .from('devis')
    .select('id, ref')
    .eq('acceptation_token', token)
    .gt('acceptation_token_expire_at', new Date().toISOString())
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json(
      { error: 'Lien invalide ou expiré' },
      { status: 404 },
    );
  }

  const devis = await getDevisById(row.id);
  if (!devis) {
    return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 });
  }

  try {
    const buffer = await renderDevisPdfBuffer(devis);
    const filename = devis.ref ? `${devis.ref}.pdf` : `devis-${devis.id}.pdf`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    logger.error('api.devis.pdf', 'render failed', { token, error: e });
    return NextResponse.json(
      { error: 'Erreur génération PDF' },
      { status: 500 },
    );
  }
}
