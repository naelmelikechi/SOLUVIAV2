import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import {
  getFactureById,
  getFactureRefById,
  type FactureDetail,
} from '@/lib/queries/factures';
import { getEmetteurInfo } from '@/lib/queries/parametres';
import { FacturePdf } from '@/components/facturation/facture-pdf';
import { createElement, type ReactElement } from 'react';

/**
 * Apercu PDF d'un brouillon de facture (statut 'a_emettre').
 *
 * Les brouillons n'ont pas encore de `ref` final ni de `numero_seq` (attribues
 * uniquement a l'envoi pour preserver la numerotation gapless legale). On
 * affiche donc un identifiant provisoire `Brouillon <8-chars>` et on rend le
 * PDF avec le banner "APERÇU" via `isDraft=true`.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const facture = await getFactureById(id);

  if (!facture) {
    return NextResponse.json(
      { error: 'Brouillon introuvable' },
      { status: 404 },
    );
  }

  if (facture.statut !== 'a_emettre') {
    return NextResponse.json({ error: 'Pas un brouillon' }, { status: 400 });
  }

  // Resolve origine ref pour les avoirs + emetteur info en parallele
  const [origineRef, emetteur] = await Promise.all([
    facture.est_avoir && facture.facture_origine_id
      ? getFactureRefById(facture.facture_origine_id)
      : Promise.resolve(null),
    getEmetteurInfo(),
  ]);

  // Identifiant provisoire pour brouillon. Le ref reel sera attribue a l'envoi.
  const draftRef = `Brouillon ${facture.id.slice(0, 8)}`;

  const draftFacture: FactureDetail = {
    ...facture,
    ref: draftRef,
  };

  const element = createElement(FacturePdf, {
    facture: draftFacture,
    origineRef,
    emetteur,
    isDraft: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as ReactElement<any>;
  const buffer = await renderToBuffer(element);
  const uint8 = new Uint8Array(buffer);

  const { searchParams } = new URL(request.url);
  const disposition =
    searchParams.get('inline') === 'true' ? 'inline' : 'attachment';
  const filename = `brouillon-${facture.id.slice(0, 8)}.pdf`;

  return new NextResponse(uint8, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      // Cache court : un brouillon peut etre edite avant envoi
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  });
}
