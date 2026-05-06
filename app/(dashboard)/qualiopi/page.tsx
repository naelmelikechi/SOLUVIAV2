import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, KeyRound, AlertTriangle } from 'lucide-react';
import { getQualiopiClients } from '@/lib/queries/qualiopi';
import { PageHeader } from '@/components/shared/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Qualité - SOLUVIA' };
export const revalidate = 60;

export default async function QualiopiHomePage() {
  const allClients = await getQualiopiClients();
  // Le pseudo-client "Interne SOLUVIA" (trigramme INT) n'a pas vocation
  // a avoir une cle Eduvia : c'est le bucket des projets internes (R&D,
  // formations internes, etc.).
  const clients = allClients.filter((c) => c.trigramme !== 'INT');
  const configured = clients.filter((c) => c.has_api_key);
  const missing = clients.filter((c) => !c.has_api_key);

  return (
    <div>
      <PageHeader
        title="Qualité"
        description="Suivi de la conformité Qualiopi des CFA via Eduvia"
      />

      {clients.length === 0 ? (
        <Card className="p-10 text-center">
          <ShieldCheck className="text-muted-foreground mx-auto mb-3 h-10 w-10" />
          <h3 className="mb-1 text-base font-semibold">Aucun client</h3>
          <p className="text-muted-foreground mx-auto max-w-md text-sm">
            Ajoutez vos clients CFA via{' '}
            <Link href="/admin/clients" className="text-primary underline">
              /admin/clients
            </Link>{' '}
            pour commencer.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {configured.length > 0 && (
            <section>
              <h2 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wide uppercase">
                CFA configurés ({configured.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {configured.map((c) => (
                  <Link key={c.id} href={`/qualiopi/${c.trigramme}`}>
                    <Card className="hover:border-primary/50 hover:bg-muted/30 cursor-pointer p-4 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                          <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">
                            {c.raison_sociale}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {c.trigramme}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {missing.length > 0 && (
            <section>
              <h2 className="text-muted-foreground mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
                <AlertTriangle className="h-4 w-4 text-[var(--warning)]" />
                CFA sans clé API Eduvia ({missing.length})
              </h2>
              <Card className="p-4">
                <p className="text-muted-foreground mb-3 text-sm">
                  Ces clients n&apos;ont pas de clé API Eduvia active.
                  Configurez-la dans la fiche du client pour activer le suivi
                  Qualiopi.
                </p>
                <ul className="divide-y divide-[var(--border-light)]">
                  {missing.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between py-2"
                    >
                      <div>
                        <span className="text-sm font-medium">
                          {c.raison_sociale}
                        </span>
                        <span className="text-muted-foreground ml-2 text-xs">
                          {c.trigramme}
                        </span>
                      </div>
                      <Link href={`/admin/clients/${c.id}`}>
                        <Button variant="outline" size="sm">
                          <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                          Configurer
                        </Button>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
