import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProjetByRef } from '@/lib/queries/projets';
import { getLancementByProjetId } from '@/lib/queries/projet-lancement';
import { createClient } from '@/lib/supabase/server';
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
  const [{ ref }, supabase] = await Promise.all([params, createClient()]);
  const [projet, authUserRes] = await Promise.all([
    getProjetByRef(ref),
    supabase.auth.getUser(),
  ]);
  if (!projet) notFound();

  const authUser = authUserRes.data.user;
  const [currentUserRes, lancement] = await Promise.all([
    authUser
      ? supabase.from('users').select('role').eq('id', authUser.id).single()
      : Promise.resolve({ data: null as { role: string | null } | null }),
    getLancementByProjetId(projet.id),
  ]);

  const userIsAdmin = isAdmin(currentUserRes?.data?.role ?? null);
  const canEdit =
    userIsAdmin ||
    projet.cdp?.id === authUser?.id ||
    projet.backup_cdp?.id === authUser?.id;

  return (
    <ProjetLancementSection
      projetId={projet.id}
      projetRef={ref}
      lancement={lancement}
      canEdit={canEdit}
      userIsAdmin={userIsAdmin}
      currentUserId={authUser?.id ?? null}
    />
  );
}
