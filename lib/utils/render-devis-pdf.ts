import 'server-only';
import { createElement, type ReactElement, type ComponentProps } from 'react';
// oxlint-disable-next-line react-doctor/prefer-dynamic-import
import { renderToBuffer } from '@react-pdf/renderer';
import { DevisPdf } from '@/components/devis/devis-pdf';

/**
 * Rend le composant DevisPdf en buffer PDF.
 *
 * react-pdf type renderToBuffer comme `ReactElement<DocumentProps>` mais
 * notre composant a sa propre signature. Le cast `any` est centralise ici
 * pour ne pas dupliquer le hack + eslint-disable dans chaque route PDF.
 */
export async function renderDevisPdfBuffer(
  devis: ComponentProps<typeof DevisPdf>['devis'],
): Promise<Buffer> {
  const element = createElement(DevisPdf, {
    devis,
  }) as ReactElement<// eslint-disable-next-line @typescript-eslint/no-explicit-any
  any>;
  return renderToBuffer(element);
}
