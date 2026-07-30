import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ProcessMarkdown } from '@/components/process/process-markdown';
import { ProcessStateBadge } from '@/components/process/process-state-badge';
import { ProcessProgress } from '@/components/process/process-progress';
import { ProcessLegend } from '@/components/process/process-legend';
import type { FicheDetail } from '@/lib/process/types';

export default async function ProcessFichePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: row } = await createAdminClient()
    .from('process_index')
    .select('titre, mission_nom, detail')
    .eq('source_fiche_id', id)
    .maybeSingle();
  if (!row) notFound();

  const detail = row.detail as FicheDetail | null;
  if (!detail) {
    return (
      <div className="text-muted-foreground p-6 text-sm">
        Détail en cours de synchronisation…
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const t = detail.taches;
  const counts = {
    total: t.length,
    realise: t.filter((x) => x.realise || x.valide_cdp || x.valide).length,
    valideCdp: t.filter((x) => x.valide_cdp || x.valide).length,
    valide: t.filter((x) => x.valide).length,
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-1">
      <Link
        href="/process"
        className="text-muted-foreground text-sm hover:underline"
      >
        ← Recherche de process
      </Link>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {detail.mission.code} · {detail.mission.nom}
          </Badge>
          {detail.fiche.priorite && (
            <Badge variant="outline">{detail.fiche.priorite}</Badge>
          )}
          {detail.fiche.statut && (
            <Badge variant="outline">{detail.fiche.statut}</Badge>
          )}
        </div>
        <h1 className="text-xl font-semibold">{detail.fiche.titre}</h1>
        {detail.fiche.description && (
          <ProcessMarkdown>{detail.fiche.description}</ProcessMarkdown>
        )}
        <ProcessProgress
          total={counts.total}
          realise={counts.realise}
          valideCdp={counts.valideCdp}
          valide={counts.valide}
        />
        <ProcessLegend />
      </header>
      <Separator />
      <ul className="flex flex-col gap-3">
        {detail.taches.map((tache, i) => (
          <li key={i}>
            <Card>
              <CardContent className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium">{tache.titre}</h3>
                  <ProcessStateBadge tache={tache} today={today} />
                </div>
                <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
                  {tache.type && <span>{tache.type}</span>}
                  {tache.echeance && <span>Échéance : {tache.echeance}</span>}
                  {tache.responsable_nom && (
                    <span>Responsable : {tache.responsable_nom}</span>
                  )}
                </div>
                {tache.description && (
                  <ProcessMarkdown>{tache.description}</ProcessMarkdown>
                )}
                {tache.liens.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {tache.liens.map((l, j) => (
                      <a
                        key={j}
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary text-sm underline"
                      >
                        {l.libelle} ↗
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
