import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { getFactureByRef } from '@/lib/mock-data';
import { FacturePdf } from '@/components/facturation/facture-pdf';
import { createElement, type ReactElement } from 'react';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  const { ref } = await params;
  const facture = getFactureByRef(ref);

  if (!facture) {
    return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = createElement(FacturePdf, { facture }) as ReactElement<any>;
  const buffer = await renderToBuffer(element);
  const uint8 = new Uint8Array(buffer);

  return new NextResponse(uint8, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${facture.ref}.pdf"`,
    },
  });
}
