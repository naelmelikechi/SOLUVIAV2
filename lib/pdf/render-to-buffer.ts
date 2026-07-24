import 'server-only';
import type { ReactElement } from 'react';
// oxlint-disable-next-line react-doctor/prefer-dynamic-import
import { renderToBuffer } from '@react-pdf/renderer';

/**
 * Rend un element React (DevisPdf, FacturePdf...) en buffer PDF.
 *
 * react-pdf type renderToBuffer comme `ReactElement<DocumentProps>` mais nos
 * composants ont leur propre signature. Le cast est centralise ici pour ne
 * pas dupliquer le hack + eslint-disable dans chaque wrapper/route PDF.
 */
export async function renderPdfToBuffer(
  element: ReactElement,
): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(element as ReactElement<any>);
}
