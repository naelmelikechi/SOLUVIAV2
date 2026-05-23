import { NextResponse } from 'next/server';
import { getFactureByRef, getFactureRefById } from '@/lib/queries/factures';
import { getEmetteurInfo } from '@/lib/queries/parametres';
import { renderFacturePdfBuffer } from '@/lib/utils/render-facture-pdf';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { ref } = await params;
  const facture = await getFactureByRef(ref);

  if (!facture) {
    return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 });
  }

  // Resolve origin facture ref for avoirs + emetteur info in parallel
  const [origineRef, emetteur] = await Promise.all([
    facture.est_avoir && facture.facture_origine_id
      ? getFactureRefById(facture.facture_origine_id)
      : Promise.resolve(null),
    getEmetteurInfo(facture.societe_emettrice_id),
  ]);

  const buffer = await renderFacturePdfBuffer({
    facture,
    origineRef,
    emetteur,
  });
  const uint8 = new Uint8Array(buffer);

  // ?inline=true renders in a browser tab / iframe (side panel preview).
  // Default: attachment download.
  const { searchParams } = new URL(request.url);
  const disposition =
    searchParams.get('inline') === 'true' ? 'inline' : 'attachment';

  return new NextResponse(uint8, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${facture.ref}.pdf"`,
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}
