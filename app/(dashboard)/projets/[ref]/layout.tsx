import { notFound } from 'next/navigation';
import { getProjetByRef } from '@/lib/queries/projets';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/utils/roles';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { ProjetDetailHeader } from '@/components/projets/projet-detail-header';
import { ProjetDuplicateButton } from '@/components/projets/projet-duplicate-button';
import { ProjetSousNav } from '@/components/projets/projet-sous-nav';

/**
 * En-tete et sous-nav partages par la synthese et les 5 sous-pages : le
 * contexte projet reste affiche en permanence, on ne se perd pas dans les
 * niveaux. getProjetByRef est memoise (cache()), donc l'appel ici ne coute
 * rien de plus a la page enfant qui le rappelle.
 */
export default async function ProjetLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ref: string }>;
}) {
  const [{ ref }, supabase] = await Promise.all([params, createClient()]);
  const [projet, authUserRes] = await Promise.all([
    getProjetByRef(ref),
    supabase.auth.getUser(),
  ]);

  if (!projet) {
    notFound();
  }

  const authUser = authUserRes.data.user;
  const currentUserRes = authUser
    ? await supabase.from('users').select('role').eq('id', authUser.id).single()
    : null;
  const userIsAdmin = isAdmin(currentUserRes?.data?.role ?? null);

  return (
    <div>
      <Breadcrumbs
        items={[{ label: 'Projets', href: '/projets' }, { label: ref }]}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <ProjetDetailHeader projet={projet} />
        {userIsAdmin && (
          <ProjetDuplicateButton
            projetId={projet.id}
            projetRef={projet.ref ?? ''}
          />
        )}
      </div>

      <ProjetSousNav projetRef={ref} />

      {children}
    </div>
  );
}
