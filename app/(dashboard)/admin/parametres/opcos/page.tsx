import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { checkAuth } from '@/lib/auth/guards';
import { listOpcos } from '@/lib/queries/opcos';
import { OpcosSection } from '@/components/admin/opcos-section';

export const metadata: Metadata = { title: 'Referentiel OPCO - SOLUVIA' };

export default async function OpcosPage() {
  const auth = await checkAuth();
  if (!auth.ok) redirect('/accueil');

  const opcos = await listOpcos(true);

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Referentiel OPCO</h1>
        <p className="text-muted-foreground mt-1">
          Mapping IDCC (conventions collectives) vers OPCO utilisé par la
          facturation.
        </p>
      </div>
      <OpcosSection opcos={opcos} />
    </div>
  );
}
