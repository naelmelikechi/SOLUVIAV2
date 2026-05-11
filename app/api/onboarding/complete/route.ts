import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/guards';

/**
 * Marque le tour guide comme termine pour l user courant (set
 * onboarding_completed_at = now()). Appele a la fin du tour OU quand
 * l user clique sur Skip.
 */
export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('users')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * Reset l etat onboarding (bouton Refaire la visite). Le composant client
 * relance le tour immediatement apres la reponse.
 */
export async function DELETE() {
  const auth = await requireUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('users')
    .update({ onboarding_completed_at: null })
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
