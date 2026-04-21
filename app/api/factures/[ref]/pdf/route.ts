import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { getFactureByRef, getFactureRefById } from '@/lib/queries/factures';
import { getEmetteurInfo } from '@/lib/queries/parametres';
import { FacturePdf } from '@/components/facturation/facture-pdf';
import { createElement, type ReactElement } from 'react';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
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
    getEmetteurInfo(),
  ]);

  const element = createElement(FacturePdf, {
    facture,
    origineRef,
    emetteur,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as ReactElement<any>;
  const buffer = await renderToBuffer(element);
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
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
