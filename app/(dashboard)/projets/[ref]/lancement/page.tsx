import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProjetByRef } from '@/lib/queries/projets';
import { getLancementByProjetId } from '@/lib/queries/projet-lancement';
import { getUser } from '@/lib/queries/users';
import { getSeuilEnlisementJours } from '@/lib/queries/parametres';
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

  const [lancement, seuilEnlisementJours] = await Promise.all([
    getLancementByProjetId(projet.id),
    getSeuilEnlisementJours(),
  ]);

  // Calcule cote serveur pour que toutes les etapes partagent la meme reference.
  const aujourdHui = new Date().toISOString().slice(0, 10);

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
      seuilEnlisementJours={seuilEnlisementJours}
      aujourdHui={aujourdHui}
    />
  );
}
