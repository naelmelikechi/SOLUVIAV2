import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

/**
 * Logout endpoint. Clears the Supabase session server-side (which sets
 * the sb-* auth cookies to expired) and redirects to /login. Useful when
 * the local cookie has a stale JWT that triggers the auth proxy redirect
 * loop (no way to clear an HttpOnly cookie from client JS).
 */
export async function GET(_request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Belt-and-suspenders: walk the cookie jar and explicitly expire every
  // sb-* auth cookie. supabase.auth.signOut() should do this already via
  // the SSR cookie adapter, but on stale-JWT scenarios the request flow
  // can swallow the Set-Cookie. We force-mutate to guarantee the proxy
  // (which only checks cookie presence) stops looping.
  const cookieStore = await cookies();
  // Return HTML (not a redirect) so a broken redirect chain elsewhere
  // doesn't sabotage the cleanup — the browser handles the meta-refresh
  // after the cookies are physically cleared.
  const response = new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Logout</title>
     <p>Session effacée. Redirection vers /login...</p>
     <script>setTimeout(()=>location.replace('/login'), 200)</script>`,
    { status: 200, headers: { 'content-type': 'text/html' } },
  );
  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith('sb-')) {
      response.cookies.set(c.name, '', { maxAge: 0, path: '/' });
    }
  }
  return response;
}
