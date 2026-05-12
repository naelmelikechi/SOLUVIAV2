import { notFound, redirect } from 'next/navigation';
import { getClientByRef, listCampusesForClient } from '@/lib/queries/qualiopi';
import { PageHeader } from '@/components/shared/page-header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

export const revalidate = 300;

export default async function QualiopiClientPage({
  params,
}: {
  params: Promise<{ clientRef: string }>;
}) {
  const { clientRef } = await params;
  const client = await getClientByRef(clientRef);
  if (!client) notFound();

  const campuses = await listCampusesForClient(client.id);

  // Si un seul campus, redirige direct vers la vue d'ensemble
  if (campuses.length === 1) {
    redirect(`/qualiopi/${clientRef}/${campuses[0]!.id}`);
  }

  return (
    <div>
      <PageHeader
        title={`Qualiopi - ${client.raison_sociale}`}
        description="Sélectionnez un campus"
      />
      {campuses.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Aucun campus accessible"
          description="Vérifiez la clé API Eduvia configurée pour ce client."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campuses.map((c) => (
            <Link key={c.id} href={`/qualiopi/${clientRef}/${c.id}`}>
              <Card className="hover:border-primary/50 cursor-pointer p-4 transition-colors">
                <div className="flex items-start gap-3">
                  <Building2 className="text-primary h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">
                      {c.denomination}
                    </div>
                    {c.uai_cfa ? (
                      <div className="text-muted-foreground font-mono text-xs">
                        UAI {c.uai_cfa}
                      </div>
                    ) : null}
                    <div className="text-muted-foreground mt-1 text-xs">
                      {c.postcode} {c.city}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
