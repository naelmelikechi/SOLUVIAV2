import 'server-only';
import { createElement, type ComponentProps } from 'react';
import { DevisPdf } from '@/components/devis/devis-pdf';
import { renderPdfToBuffer } from '@/lib/pdf/render-to-buffer';

/** Rend le composant DevisPdf en buffer PDF (cast centralise dans lib/pdf). */
export async function renderDevisPdfBuffer(
  devis: ComponentProps<typeof DevisPdf>['devis'],
): Promise<Buffer> {
  return renderPdfToBuffer(createElement(DevisPdf, { devis }));
}
