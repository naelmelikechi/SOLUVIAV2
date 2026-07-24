import 'server-only';
import { createElement, type ComponentProps } from 'react';
import { FacturePdf } from '@/components/facturation/facture-pdf';
import { renderPdfToBuffer } from '@/lib/pdf/render-to-buffer';

/** Rend le composant FacturePdf en buffer PDF (cast centralise dans lib/pdf). */
export async function renderFacturePdfBuffer(
  props: ComponentProps<typeof FacturePdf>,
): Promise<Buffer> {
  return renderPdfToBuffer(createElement(FacturePdf, props));
}
