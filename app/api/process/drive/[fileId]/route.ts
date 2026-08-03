import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  driveConfigured,
  fetchDriveFile,
  isKnownDeliverable,
} from '@/lib/process/drive';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Page affichée dans l'iframe pour un type non prévisualisable (ex. .zip, .docx).
// Servie avec `Content-Security-Policy: sandbox` (aucun script).
const UNSUPPORTED_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#5b6b62;background:#f6f8f5"><div style="text-align:center;padding:2rem;max-width:32ch"><p style="font-size:15px;margin:0 0 .4rem">Aperçu non disponible pour ce type de fichier.</p><p style="font-size:13px;color:#8a968e;margin:0">Utilisez « Ouvrir dans Drive » ci-dessous.</p></div></body>`;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!driveConfigured())
    return NextResponse.json(
      { error: 'drive_not_configured' },
      { status: 503 },
    );

  if (!/^[a-zA-Z0-9_-]+$/.test(fileId))
    return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  if (!(await isKnownDeliverable(supabase, fileId)))
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    const res = await fetchDriveFile(fileId);
    if (res.status === 415) {
      // Type non prévisualisable → page-message propre (servie sandboxée) au
      // lieu d'un JSON brut affiché dans l'iframe.
      return new NextResponse(UNSUPPORTED_HTML, {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy': 'sandbox',
          'cache-control': 'private, max-age=300',
        },
      });
    }
    if (res.status !== 200 || !res.body) {
      console.error('[process/drive] fetch échec', fileId, res.status);
      return NextResponse.json({ error: 'drive_error' }, { status: 502 });
    }
    const headers: Record<string, string> = {
      'content-type': res.contentType,
      'content-disposition': 'inline',
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, max-age=300',
    };
    // HTML/SVG : sandbox → le document s'affiche mais aucun script ne s'exécute.
    if (res.sandbox) headers['content-security-policy'] = 'sandbox';
    return new NextResponse(res.body, { status: 200, headers });
  } catch (e) {
    console.error(
      '[process/drive]',
      e instanceof Error ? e.message : String(e),
    );
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
