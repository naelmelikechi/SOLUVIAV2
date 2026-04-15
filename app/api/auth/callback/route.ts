import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const type = searchParams.get('type');
  const next = searchParams.get('next') ?? '/projets';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Recovery flow = user needs to set their password
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/set-password`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Also handle hash-based recovery tokens (Supabase sometimes uses #access_token=...)
  // These are handled client-side, redirect to set-password page
  const hash = new URL(request.url).hash;
  if (hash?.includes('type=recovery')) {
    return NextResponse.redirect(`${origin}/set-password`);
  }

  // Auth error - redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
