import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/queries/users';
import { getCollabStatus } from '@/lib/queries/collab-status';
import { getParametreValeur } from '@/lib/queries/parametres';
import { createClient } from '@/lib/supabase/server';
import { AccueilPageClient } from '@/components/accueil/accueil-page-client';

export const metadata: Metadata = { title: 'Accueil - SOLUVIA' };
export const revalidate = 0;

export default async function AccueilPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const status = await getCollabStatus(user.id);

  // Cette page est un parcours d onboarding pour les collaborateurs sans
  // projet affecte. Tous les autres rôles sont rediriges vers leur entree
  // habituelle.
  if (status.status !== 'unassigned_collaborator') {
    redirect('/projets');
  }

  const supabase = await createClient();

  // Heures internes saisies (lifetime) pour cocher la checklist
  const { count: saisiesCount } = await supabase
    .from('saisies_temps')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  // Heures internes cumulees ce mois-ci par categorie
  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartIso = monthStart.toISOString().split('T')[0]!;

  const { data: heuresMois } = await supabase
    .from('saisies_temps')
    .select(
      `
      heures,
      projet:projets!saisies_temps_projet_id_fkey (
        est_interne,
        categorie_interne
      )
    `,
    )
    .eq('user_id', user.id)
    .gte('date', monthStartIso);

  const heuresParCategorie: Record<string, number> = {};
  let heuresMoisTotal = 0;
  for (const row of heuresMois ?? []) {
    const projet = row.projet as unknown as {
      est_interne: boolean | null;
      categorie_interne: string | null;
    } | null;
    if (!projet?.est_interne || !projet.categorie_interne) continue;
    heuresParCategorie[projet.categorie_interne] =
      (heuresParCategorie[projet.categorie_interne] ?? 0) + (row.heures ?? 0);
    heuresMoisTotal += row.heures ?? 0;
  }

  const profilComplet = !!user.telephone && user.telephone.trim().length > 0;
  const aSaisiTemps = (saisiesCount ?? 0) > 0;
  const wikiUrl = await getParametreValeur('onboarding_wiki_url');

  return (
    <AccueilPageClient
      prenom={user.prenom ?? ''}
      profilComplet={profilComplet}
      aSaisiTemps={aSaisiTemps}
      heuresMoisTotal={heuresMoisTotal}
      heuresParCategorie={heuresParCategorie}
      wikiUrl={wikiUrl}
    />
  );
}
