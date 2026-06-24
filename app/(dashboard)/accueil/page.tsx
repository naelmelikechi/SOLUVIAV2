import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/queries/users';
import { getCollabStatus } from '@/lib/queries/collab-status';
import { getParametreValeur } from '@/lib/queries/parametres';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/utils/roles';
import { resolveAccueilView } from '@/lib/utils/accueil-routing';
import { getAccueilCdpData } from '@/lib/queries/accueil';
import { getContratsNonFacturesGlobal } from '@/lib/queries/contrats-a-facturer';
import { AccueilPageClient } from '@/components/accueil/accueil-page-client';
import { AccueilCdp } from '@/components/accueil/accueil-cdp';
import { AccueilSuperadmin } from '@/components/accueil/accueil-superadmin';

export const metadata: Metadata = { title: 'Accueil - SOLUVIA' };
export const revalidate = 0;

// Landing universelle, rôle-adaptative :
//   - admin/superadmin -> supervision globale (contrats non facturés Eduvia)
//   - CDP (>=1 projet)  -> worklist « À faire »
//   - commercial pur    -> redirect /commercial/prospects
//   - sinon             -> onboarding collaborateur (inchangé)
export default async function AccueilPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const status = await getCollabStatus(user.id);
  const view = resolveAccueilView({
    isAdmin: isAdmin(user.role),
    projetsCount: status.projetsCount,
    status: status.status,
  });

  if (view === 'superadmin') {
    const [contrats, worklist] = await Promise.all([
      getContratsNonFacturesGlobal(),
      getAccueilCdpData(user.id),
    ]);
    return (
      <AccueilSuperadmin
        prenom={user.prenom ?? ''}
        contrats={contrats}
        worklist={worklist.items}
      />
    );
  }

  if (view === 'cdp') {
    const data = await getAccueilCdpData(user.id);
    return <AccueilCdp prenom={user.prenom ?? ''} data={data} />;
  }

  if (view === 'commercial') {
    redirect('/commercial/prospects');
  }

  return (
    <OnboardingView
      userId={user.id}
      prenom={user.prenom ?? ''}
      telephone={user.telephone}
    />
  );
}

// Onboarding des collaborateurs sans projet affecté (parcours inchangé).
async function OnboardingView({
  userId,
  prenom,
  telephone,
}: {
  userId: string;
  prenom: string;
  telephone: string | null;
}) {
  const supabase = await createClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartIso = monthStart.toISOString().split('T')[0]!;

  const [saisiesCountRes, heuresMoisRes, wikiUrl] = await Promise.all([
    supabase
      .from('saisies_temps')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase
      .from('saisies_temps')
      .select(
        `
        heures,
        projet:projets!saisies_temps_projet_id_fkey (
          est_interne,
          categorie_interne:categories_internes!projets_categorie_interne_id_fkey (
            code
          )
        )
      `,
      )
      .eq('user_id', userId)
      .gte('date', monthStartIso),
    getParametreValeur('onboarding_wiki_url'),
  ]);

  const saisiesCount = saisiesCountRes.count;
  const heuresMois = heuresMoisRes.data;

  const heuresParCategorie: Record<string, number> = {};
  let heuresMoisTotal = 0;
  for (const row of heuresMois ?? []) {
    const projet = row.projet as unknown as {
      est_interne: boolean | null;
      categorie_interne: { code: string } | { code: string }[] | null;
    } | null;
    if (!projet?.est_interne) continue;
    const catRaw = projet.categorie_interne;
    const code = Array.isArray(catRaw) ? catRaw[0]?.code : catRaw?.code;
    if (!code) continue;
    heuresParCategorie[code] =
      (heuresParCategorie[code] ?? 0) + (row.heures ?? 0);
    heuresMoisTotal += row.heures ?? 0;
  }

  const profilComplet = !!telephone && telephone.trim().length > 0;
  const aSaisiTemps = (saisiesCount ?? 0) > 0;

  return (
    <AccueilPageClient
      prenom={prenom}
      profilComplet={profilComplet}
      aSaisiTemps={aSaisiTemps}
      heuresMoisTotal={heuresMoisTotal}
      heuresParCategorie={heuresParCategorie}
      wikiUrl={wikiUrl}
    />
  );
}
