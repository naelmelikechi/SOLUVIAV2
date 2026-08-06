import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProjetByRef } from '@/lib/queries/projets';
import { ProjetQualiteSection } from '@/components/projets/projet-qualite-section';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `Qualité - ${ref} - SOLUVIA` };
}

// Au lot 0 la page ne porte que le renvoi vers le module Qualiopi. Le
// "reste a faire priorise" arrive au lot 4.
export default async function ProjetQualitePage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const projet = await getProjetByRef(ref);
  if (!projet) notFound();

  return (
    <ProjetQualiteSection clientTrigramme={projet.client?.trigramme ?? null} />
  );
}
