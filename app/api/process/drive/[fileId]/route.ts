import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  driveConfigured,
  fetchDriveFile,
  isKnownDeliverable,
} from '@/lib/process/drive';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
  const admin = createAdminClient();
  if (!(await isKnownDeliverable(admin, fileId)))
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    const res = await fetchDriveFile(fileId);
    if (res.status !== 200 || !res.body) {
      console.error('[process/drive] fetch échec', fileId, res.status);
      return NextResponse.json({ error: 'drive_error' }, { status: 502 });
    }
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        'content-type': res.contentType,
        'content-disposition': 'inline',
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, max-age=300',
      },
    });
  } catch (e) {
    console.error(
      '[process/drive]',
      e instanceof Error ? e.message : String(e),
    );
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
