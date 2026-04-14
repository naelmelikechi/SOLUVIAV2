import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets and API routes — saves function invocations
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
  const isAuthRoute = pathname === '/login' || pathname === '/forgot-password';
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

  // Only refresh session for authenticated dashboard pages (the expensive call)
  const response = await updateSession(request);

  return response;
}
