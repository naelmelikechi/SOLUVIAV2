import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDevisById } from '@/lib/queries/devis';
import { renderDevisPdfBuffer } from '@/lib/utils/render-devis-pdf';
import { logger } from '@/lib/utils/logger';

export const maxDuration = 60;

/**
 * Apercu PDF d'un brouillon de devis (statut 'brouillon').
 *
 * Les brouillons n'ont pas encore de `ref` ni de `acceptation_token` (attribues
 * uniquement a l'envoi). Cette route est donc gardee par l'authentification
 * (et non par un token public) et rend directement le devis par son id.
 * Le composant DevisPdf affiche deja "Brouillon" quand `ref` est null.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { id } = await params;
  const devis = await getDevisById(id);

  if (!devis) {
    return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 });
  }

  if (devis.statut !== 'brouillon') {
    return NextResponse.json({ error: 'Pas un brouillon' }, { status: 400 });
  }

  try {
    const buffer = await renderDevisPdfBuffer(devis);
    const { searchParams } = new URL(request.url);
    const disposition =
      searchParams.get('inline') === 'true' ? 'inline' : 'attachment';
    const filename = `brouillon-${devis.id.slice(0, 8)}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${filename}"`,
        // Cache court : un brouillon peut etre edite avant envoi
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    });
  } catch (e) {
    logger.error('api.devis.brouillon.pdf', 'render failed', { id, error: e });
    return NextResponse.json(
      { error: 'Erreur génération PDF' },
      { status: 500 },
    );
  }
}
