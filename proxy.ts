import { type NextRequest, NextResponse } from 'next/server';

// Auth proxy -- will be implemented with @supabase/ssr
// For now, passes all requests through
export function proxy(_request: NextRequest) {
  // TODO: Implement Supabase JWT refresh and auth checks
  // - No session + non-auth path -> redirect /login
  // - Valid session + auth path -> redirect /projets
  // - /admin/parametres -> check admin role
  return NextResponse.next();
}

export const proxyConfig = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/cron).*)'],
};
