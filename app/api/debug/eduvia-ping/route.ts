import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';

// TEMPORARY debug endpoint to test whether Vercel can reach api.demo.eduvia.app.
// Answers the question "does the TLS handshake issue we saw locally happen in
// prod too, or is it specific to our macOS stack?". Delete after testing.
export async function POST(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const url = 'https://api.demo.eduvia.app/api/v1/contracts?page=1&per_page=1';
  const token =
    '82b6708173ad69bdfe42d3ec924e6bbcbc87ddf94ab7d04fd79884c1049e48dc';

  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      ms: Date.now() - started,
      headers: Object.fromEntries(response.headers.entries()),
      bodyPreview: text.slice(0, 500),
    });
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    return NextResponse.json(
      {
        ok: false,
        ms: Date.now() - started,
        errorName: e?.name,
        errorMessage: e?.message,
        errorCode: e?.cause?.code,
      },
      { status: 200 },
    );
  }
}
