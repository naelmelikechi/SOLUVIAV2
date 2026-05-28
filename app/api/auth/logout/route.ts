import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

// Manual recovery URL: the user hits /api/auth/logout in the address bar to
// clear a stale JWT cookie that traps them in the auth proxy redirect loop.
// GET returns an auto-submitting form so the actual signout (cookie clear)
// happens via POST — prevents CSRF + prefetch triggering.
// oxlint-disable-next-line react-doctor/nextjs-no-side-effect-in-get-handler
export function GET() {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Logout</title>
     <form id="f" method="POST" action="/api/auth/logout"></form>
     <p>Déconnexion en cours…</p>
     <script>document.getElementById('f').submit()</script>`,
    { status: 200, headers: { 'content-type': 'text/html' } },
  );
}

export async function POST() {
  const [supabase, cookieStore] = await Promise.all([
    createClient(),
    cookies(),
  ]);
  await supabase.auth.signOut();

  const response = new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Logout</title>
     <p>Session effacée. Redirection vers /login…</p>
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
