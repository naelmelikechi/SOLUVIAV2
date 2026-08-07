import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getProjetByRef } from '@/lib/queries/projets';
import { ProjetQualiteSection } from '@/components/projets/projet-qualite-section';
import { ProjetQualiteReste } from '@/components/projets/projet-qualite-reste';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `Qualité - ${ref} - SOLUVIA` };
}

function QualiteResteSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}

export default async function ProjetQualitePage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const projet = await getProjetByRef(ref);
  if (!projet) notFound();

  return (
    <div className="space-y-6">
      {/* Le score et le reste a faire dependent du client Qualiopi, qui n'a
          ni delai d'expiration ni annulation (lib/eduvia/quality-client.ts) :
          isoles sous Suspense pour ne jamais bloquer l'affichage du renvoi
          vers le module Qualiopi ci-dessous. */}
      <Suspense fallback={<QualiteResteSkeleton />}>
        {projet.client ? (
          <ProjetQualiteReste
            clientId={projet.client.id}
            clientTrigramme={projet.client.trigramme}
          />
        ) : (
          <Card className="p-6">
            <p className="text-muted-foreground text-sm">
              Aucun client associé à ce projet.
            </p>
          </Card>
        )}
      </Suspense>

      <ProjetQualiteSection
        clientTrigramme={projet.client?.trigramme ?? null}
      />
    </div>
  );
}
