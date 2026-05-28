import 'server-only';
import { createElement, type ReactElement, type ComponentProps } from 'react';
// oxlint-disable-next-line react-doctor/prefer-dynamic-import
import { renderToBuffer } from '@react-pdf/renderer';
import { FacturePdf } from '@/components/facturation/facture-pdf';

/**
 * Rend le composant FacturePdf en buffer PDF.
 *
 * react-pdf type renderToBuffer comme `ReactElement<DocumentProps>` mais
 * notre composant a sa propre signature. Le cast `any` est centralise ici
 * pour ne pas dupliquer le hack + eslint-disable dans chaque route PDF.
 */
export async function renderFacturePdfBuffer(
  props: ComponentProps<typeof FacturePdf>,
): Promise<Buffer> {
  const element = createElement(
    FacturePdf,
    props,
  ) as ReactElement<// eslint-disable-next-line @typescript-eslint/no-explicit-any
  any>;
  return renderToBuffer(element);
}
