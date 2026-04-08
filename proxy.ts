import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  // 1. Refresh the Supabase session (important for Server Components)
  const response = await updateSession(request);

  const { pathname } = request.nextUrl;

  // 2. Check if user has a session by looking at cookies
  // Supabase stores session in cookies prefixed with 'sb-'
  const hasSession = request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'));

  // 3. Auth routes: redirect to /projets if already logged in
  const isAuthRoute = pathname === '/login' || pathname === '/forgot-password';
  if (isAuthRoute && hasSession) {
    return NextResponse.redirect(new URL('/projets', request.url));
  }

  // 4. Protected routes: redirect to /login if not logged in
  const isPublicRoute = isAuthRoute || pathname.startsWith('/api/');
  if (!isPublicRoute && !hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}

export const proxyConfig = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/cron).*)'],
};
