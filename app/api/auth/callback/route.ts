import { NextResponse } from 'next/server';

// Supabase auth callback handler -- to implement with @supabase/ssr
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    // TODO: Exchange code for session using Supabase server client
  }

  return NextResponse.redirect(new URL('/projets', request.url));
}
