import { cache } from 'react';
import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Badge } from '@/components/ui/badge';
import { ProcessMarkdown } from '@/components/process/process-markdown';
import { ProcessStep } from '@/components/process/process-step';
import { missionInitials } from '@/lib/process/format';
import type { FicheDetail, FicheDetailTache } from '@/lib/process/types';

/** Charge la ligne `process_index` nécessaire à la page ET à `generateMetadata`, mémoïsée par requête. */
const getFicheRow = cache(async (id: string) => {
  const { data } = await createAdminClient()
    .from('process_index')
    .select('titre, mission_nom, detail')
    .eq('source_fiche_id', id)
    .maybeSingle();
  return data;
});

// Lit la row via l'admin client ; l'accès à la route est protégé par `proxy.ts`
// (le corps de la page ajoute en plus un gate `getUser()` explicite).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const row = await getFicheRow(id);
  return {
    title: row ? `${row.titre} · Process · SOLUVIA` : 'Process · SOLUVIA',
  };
}

/** Responsable non-null le plus fréquent parmi les tâches (null si aucun). */
function pickPilote(taches: FicheDetailTache[]): string | null {
  const counts = new Map<string, number>();
  for (const t of taches) {
    if (!t.responsable_nom) continue;
    counts.set(t.responsable_nom, (counts.get(t.responsable_nom) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

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

  const row = await getFicheRow(id);
  if (!row) notFound();

  const detail = row.detail as FicheDetail | null;
  if (!detail) {
    return (
      <div className="text-muted-foreground p-6 text-sm">
        Détail en cours de synchronisation…
      </div>
    );
  }

  const taches = detail.taches;
  const steps = taches.length;
  const docs = taches.filter((t) => t.type === 'document').length;
  const feats = taches.filter((t) => t.type === 'feature').length;
  const pilote = pickPilote(taches);

  return (
    <div className="mx-auto flex max-w-[760px] flex-col pb-16">
      <div className="flex flex-wrap items-center gap-3 py-4">
        <Link
          href="/process"
          className="border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground focus-visible:outline-primary inline-flex items-center gap-1.5 rounded-full border py-1.5 pr-3.5 pl-2.5 text-[13px] transition focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <ArrowLeft className="size-[15px]" />
          Recherche
        </Link>
        <span className="text-muted-foreground font-mono text-[11px] tracking-[0.12em] uppercase">
          Mission {detail.mission.code} · {detail.mission.nom}
        </span>
      </div>

      <header className="border-border flex flex-col border-b pb-[22px]">
        <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
          {detail.fiche.code && (
            <Badge
              variant="outline"
              className="bg-primary/10 text-primary border-transparent font-mono text-[12px] font-semibold tracking-wide"
            >
              {detail.fiche.code}
            </Badge>
          )}
          {detail.fiche.priorite && (
            <Badge
              variant="outline"
              className="bg-destructive/10 text-destructive border-transparent font-mono text-[11px] font-bold tracking-wide"
            >
              {detail.fiche.priorite}
            </Badge>
          )}
        </div>
        <h1 className="text-[28px] leading-[1.1] font-semibold tracking-tight sm:text-[32px]">
          {detail.fiche.titre}
        </h1>
        {detail.fiche.description && (
          <div className="text-muted-foreground mt-3 max-w-[64ch] text-[15.5px] [&_p]:my-0">
            <ProcessMarkdown>{detail.fiche.description}</ProcessMarkdown>
          </div>
        )}
        <div className="mt-[18px] flex flex-wrap gap-[26px]">
          <Stat
            value={
              <>
                {steps}{' '}
                <span className="text-muted-foreground text-[13px] font-semibold">
                  étape{steps > 1 ? 's' : ''}
                </span>
              </>
            }
            label="Séquence"
          />
          <Stat
            value={`${docs} doc${docs > 1 ? 's' : ''} · ${feats} fonction${feats > 1 ? 's' : ''}`}
            label="Composition"
          />
          <Stat
            value={
              <>
                {pilote && (
                  <span
                    aria-hidden
                    className="bg-primary/10 text-primary mr-2 inline-grid size-5 shrink-0 place-items-center rounded-full align-middle text-[10px] font-bold"
                  >
                    {missionInitials(pilote)}
                  </span>
                )}
                {pilote ?? '—'}
              </>
            }
            label="Pilote"
          />
        </div>
      </header>

      <ol className="relative mt-[26px]">
        {taches.map((tache, i) => (
          <ProcessStep
            key={i}
            index={i + 1}
            tache={tache}
            isLast={i === taches.length - 1}
          />
        ))}
      </ol>
    </div>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[19px] leading-none font-bold tracking-tight tabular-nums">
        {value}
      </span>
      <span className="text-muted-foreground font-mono text-[11px] tracking-[0.1em] uppercase">
        {label}
      </span>
    </div>
  );
}
