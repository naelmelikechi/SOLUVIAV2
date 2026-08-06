import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProjetByRef } from '@/lib/queries/projets';
import { getLancementByProjetId } from '@/lib/queries/projet-lancement';
import { getUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { ProjetLancementSection } from '@/components/projets/projet-lancement-section';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `Lancement - ${ref} - SOLUVIA` };
}

export default async function ProjetLancementPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  // getUser() est memoise (cache()) et deja resolu par le layout dashboard.
  const [projet, user] = await Promise.all([getProjetByRef(ref), getUser()]);
  if (!projet) notFound();

  const lancement = await getLancementByProjetId(projet.id);

  const userIsAdmin = isAdmin(user?.role ?? null);
  const canEdit =
    userIsAdmin ||
    projet.cdp?.id === user?.id ||
    projet.backup_cdp?.id === user?.id;

  return (
    <ProjetLancementSection
      projetId={projet.id}
      projetRef={ref}
      lancement={lancement}
      canEdit={canEdit}
      userIsAdmin={userIsAdmin}
      currentUserId={user?.id ?? null}
    />
  );
}
