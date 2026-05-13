import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Recherche globale legere pour le Cmd+K : projets, clients, factures.
// RLS s'applique automatiquement (le client est cote utilisateur connecte).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) {
    return NextResponse.json({
      projets: [],
      clients: [],
      factures: [],
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const pattern = `%${q}%`;

  const [projetsRes, clientsRes, facturesRes] = await Promise.all([
    supabase
      .from('projets')
      .select('ref, client:clients!projets_client_id_fkey(raison_sociale)')
      .ilike('ref', pattern)
      .eq('archive', false)
      .limit(5),
    supabase
      .from('clients')
      .select('id, trigramme, raison_sociale')
      .or(`trigramme.ilike.${pattern},raison_sociale.ilike.${pattern}`)
      .eq('archive', false)
      .limit(5),
    supabase
      .from('factures')
      .select('numero, projet:projets!factures_projet_id_fkey(ref)')
      .ilike('numero', pattern)
      .limit(5),
  ]);

  // On cherche aussi les projets par raison_sociale du client (utile : taper
  // "HEOL" doit retrouver le projet 0015-HED-APP).
  const projetsByClientRes =
    q.length >= 3
      ? await supabase
          .from('projets')
          .select(
            'ref, client:clients!projets_client_id_fkey!inner(raison_sociale, trigramme)',
          )
          .or(`raison_sociale.ilike.${pattern},trigramme.ilike.${pattern}`, {
            foreignTable: 'clients',
          })
          .eq('archive', false)
          .limit(5)
      : { data: [] };

  type ProjetRow = { ref: string; client: { raison_sociale: string } | null };
  const projetsMap = new Map<string, ProjetRow>();
  for (const p of (projetsRes.data ?? []) as ProjetRow[]) {
    if (p.ref) projetsMap.set(p.ref, p);
  }
  for (const p of (projetsByClientRes.data ?? []) as ProjetRow[]) {
    if (p.ref) projetsMap.set(p.ref, p);
  }

  return NextResponse.json({
    projets: Array.from(projetsMap.values()).slice(0, 5),
    clients: clientsRes.data ?? [],
    factures: facturesRes.data ?? [],
  });
}
