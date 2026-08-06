import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProjetByRef, getContratsByProjetId } from '@/lib/queries/projets';
import { ProjetContratsTable } from '@/components/projets/projet-contrats-table';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `Contrats - ${ref} - SOLUVIA` };
}

export default async function ProjetContratsPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const projet = await getProjetByRef(ref);
  if (!projet) notFound();

  const contrats = await getContratsByProjetId(projet.id);

  return <ProjetContratsTable contrats={contrats} />;
}
