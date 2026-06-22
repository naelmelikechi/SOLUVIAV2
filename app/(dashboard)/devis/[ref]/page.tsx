import { redirect, notFound } from 'next/navigation';
import { getUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { getDevisByRef, getDevisById } from '@/lib/queries/devis';
import { DevisDetailClient } from '@/components/devis/devis-detail-client';

interface Props {
  params: Promise<{ ref: string }>;
}

export default async function DevisDetailPage({ params }: Props) {
  const [{ ref }, user] = await Promise.all([params, getUser()]);
  if (!isAdmin(user?.role)) redirect('/accueil');

  // ref peut etre un ref final (DEV-SOL-0001) ou un UUID (brouillon sans ref)
  const devis = ref.startsWith('DEV-')
    ? await getDevisByRef(ref)
    : await getDevisById(ref);

  if (!devis) notFound();

  return <DevisDetailClient devis={devis} />;
}
