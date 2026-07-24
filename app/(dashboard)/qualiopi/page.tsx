import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, KeyRound, AlertTriangle } from 'lucide-react';
import { getQualiopiClients } from '@/lib/queries/qualiopi';
import { PageHeader } from '@/components/shared/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/utils/roles';

export const metadata: Metadata = { title: 'Qualité - SOLUVIA' };
export const revalidate = 60;

export default async function QualiopiHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: currentUser } = user
    ? await supabase.from('users').select('role').eq('id', user.id).single()
    : { data: null };
  const userIsAdmin = isAdmin(currentUser?.role ?? null);

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
        <EmptyState
          icon={ShieldCheck}
          title="Aucun client"
          description="Ajoutez vos clients CFA pour activer le suivi Qualiopi."
        >
          <Link href="/admin/clients">
            <Button size="sm">Gérer les clients</Button>
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {configured.length > 0 && (
            <section>
              <h2 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wide uppercase">
                CFA en gestion ({configured.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {configured.map((c) => (
                  <Link key={c.id} href={`/qualiopi/${c.trigramme}`}>
                    <Card className="hover:border-primary/50 hover:bg-muted/30 cursor-pointer p-4 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                          <ShieldCheck className="size-5" />
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

          {/* Tache de configuration (cle API dans la fiche client) : reservee
              aux admins - un CDP n'a rien a faire de cette liste. */}
          {userIsAdmin && missing.length > 0 && (
            <details className="group">
              <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer list-none items-center gap-2 text-sm">
                <AlertTriangle className="size-4 shrink-0 text-[var(--warning)]" />
                <span>
                  {missing.length} CFA sans clé API Eduvia (suivi Qualiopi
                  inactif) - afficher
                </span>
              </summary>
              <Card className="mt-3 p-4">
                <ul className="divide-y divide-[var(--border-light)]">
                  {missing.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between py-1.5"
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
                          <KeyRound className="mr-1.5 size-3.5" />
                          Configurer
                        </Button>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
