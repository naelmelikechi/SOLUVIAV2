import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Recherche globale legere pour le Cmd+K : projets, clients, factures,
// apprenants, contrats.
// RLS s'applique automatiquement (le client est cote utilisateur connecte) :
// un CDP ne voit que les contrats de ses projets, et les apprenants sont
// scopes via le join !inner sur contrats.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) {
    return NextResponse.json({
      projets: [],
      clients: [],
      factures: [],
      apprenants: [],
      contrats: [],
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const pattern = `%${q}%`;

  const [projetsRes, clientsRes, facturesRes, apprenantsRes, contratsRes] =
    await Promise.all([
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
      supabase
        .from('apprenants')
        .select(
          'id, nom, prenom, contrat:contrats!apprenants_contrat_id_fkey!inner(projet:projets!contrats_projet_id_fkey!inner(ref))',
        )
        .or(`nom.ilike.${pattern},prenom.ilike.${pattern}`)
        .eq('contrat.archive', false)
        .limit(5),
      supabase
        .from('contrats')
        .select(
          'id, contract_number, ref, apprenant_nom, apprenant_prenom, projet:projets!contrats_projet_id_fkey!inner(ref)',
        )
        .or(`contract_number.ilike.${pattern},ref.ilike.${pattern}`)
        .eq('archive', false)
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

  // Apprenants : on aplatit contrat.projet -> projet (meme shape que les
  // factures) et on ecarte les rares lignes sans ref de projet (pas d'URL
  // de destination possible).
  type ApprenantRow = {
    id: string;
    nom: string | null;
    prenom: string | null;
    contrat: { projet: { ref: string | null } | null } | null;
  };
  const apprenants = ((apprenantsRes.data ?? []) as ApprenantRow[]).flatMap(
    (a) => {
      const ref = a.contrat?.projet?.ref;
      if (!ref) return [];
      return [{ id: a.id, nom: a.nom, prenom: a.prenom, projet: { ref } }];
    },
  );

  type ContratRow = {
    id: string;
    contract_number: string | null;
    ref: string | null;
    apprenant_nom: string | null;
    apprenant_prenom: string | null;
    projet: { ref: string | null } | null;
  };
  const contrats = ((contratsRes.data ?? []) as ContratRow[]).filter(
    (c) => c.projet?.ref,
  );

  return NextResponse.json({
    projets: Array.from(projetsMap.values()).slice(0, 5),
    clients: clientsRes.data ?? [],
    factures: facturesRes.data ?? [],
    apprenants,
    contrats,
  });
}
