import { notFound } from 'next/navigation';
import { getTachesByProjetRef } from '@/lib/queries/qualite';
import { PageHeader } from '@/components/shared/page-header';
import { ProjectRef } from '@/components/shared/project-ref';
import { StatusBadge } from '@/components/shared/status-badge';
import { FamilleCard } from '@/components/qualite/famille-card';

export default async function QualiteDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const result = await getTachesByProjetRef(ref);

  if (!result) {
    notFound();
  }

  const { projet, taches } = result;
  const totalDone = taches.filter((t) => t.fait).length;
  const totalPct =
    taches.length > 0 ? Math.round((totalDone / taches.length) * 100) : 0;

  // Group tasks by famille
  const famillesMap = new Map<
    string,
    { code: string; libelle: string; taches: typeof taches }
  >();
  for (const t of taches) {
    const existing = famillesMap.get(t.famille_code);
    if (existing) {
      existing.taches.push(t);
    } else {
      famillesMap.set(t.famille_code, {
        code: t.famille_code,
        libelle: t.famille_libelle ?? '',
        taches: [t],
      });
    }
  }
  const familles = Array.from(famillesMap.values());

  // Compute familles conformes count
  const totalFamilles = familles.length;
  const famillesConformes = familles.filter(
    (f) => f.taches.length > 0 && f.taches.every((t) => t.fait),
  ).length;

  return (
    <div>
      <PageHeader title="Qualité">
        <ProjectRef ref_={projet.ref ?? ''} />
      </PageHeader>

      <div className="mb-6 flex items-center gap-6">
        <div className="text-sm">
          <span className="text-muted-foreground">Complétion globale : </span>
          <span className="text-lg font-bold">{totalPct}%</span>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Livrables : </span>
          <span className="text-primary font-semibold">{totalDone}</span>
          <span className="text-muted-foreground"> / {taches.length}</span>
          <span className="text-muted-foreground"> · </span>
          <span className="text-primary font-semibold">
            {famillesConformes}
          </span>
          <span className="text-muted-foreground">
            {' '}
            / {totalFamilles} familles conformes
          </span>
        </div>
        <StatusBadge label="Eduvia" color="orange" />
      </div>

      <div className="space-y-3">
        {familles.map((famille) => {
          const done = famille.taches.filter((t) => t.fait).length;
          const total = famille.taches.length;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;

          const indicateurs = new Set(
            famille.taches.map((t) => t.indicateur).filter(Boolean),
          ).size;

          return (
            <FamilleCard
              key={famille.code}
              code={famille.code}
              libelle={famille.libelle}
              done={done}
              total={total}
              pct={pct}
              indicateurs={indicateurs}
              livrables={famille.taches.map((t) => ({
                id: t.id,
                label: t.livrable ?? '',
                fait: t.fait,
                eduvia_url: t.eduvia_url,
              }))}
            />
          );
        })}
      </div>
    </div>
  );
}
