import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets and API routes - saves function invocations
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/logo') ||
    pathname.startsWith('/api/') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check session from cookies (fast, no Supabase call)
  const hasSession = request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'));

  // Auth routes: redirect if already logged in (no session refresh needed)
  const isAuthRoute =
    pathname === '/login' ||
    pathname === '/forgot-password' ||
    pathname === '/set-password' ||
    pathname === '/mentions-legales' ||
    pathname === '/politique-de-confidentialite';

  // set-password is special: user arrives with a recovery session, let them through
  if (pathname === '/set-password') {
    return NextResponse.next();
  }

  if (isAuthRoute && hasSession) {
    return NextResponse.redirect(new URL('/projets', request.url));
  }
  if (isAuthRoute) {
    return NextResponse.next();
  }

  // Not logged in → redirect to login (no session refresh needed)
  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Only refresh session every 5 minutes (not on every page navigation)
  // This saves ~100-300ms per page load
  const lastRefresh = request.cookies.get('sb-last-refresh')?.value;
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  if (lastRefresh && now - Number(lastRefresh) < fiveMinutes) {
    return NextResponse.next();
  }

  const response = await updateSession(request);
  response.cookies.set('sb-last-refresh', String(now), {
    httpOnly: true,
    // In dev over HTTP, secure:true prevents the browser from storing the
    // cookie, which silently breaks the 5-min throttle (every request re-runs
    // updateSession). Gate on NODE_ENV so local dev works.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 3600,
  });

  return response;
}
