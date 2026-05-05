import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, ShieldCheck, AlertTriangle } from 'lucide-react';
import {
  getClientByRef,
  getDeliverableStatuses,
  getReferentiel,
  listCampusesForClient,
} from '@/lib/queries/qualiopi';
import { computeCompletion } from '@/lib/eduvia/quality-types';
import { PageHeader } from '@/components/shared/page-header';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { CriteriaFilter } from '@/components/qualiopi/criteria-filter';

export const revalidate = 60;

interface PageProps {
  params: Promise<{ clientRef: string; campusId: string }>;
  searchParams: Promise<{ filter?: string }>;
}

export default async function QualiopiCampusPage({
  params,
  searchParams,
}: PageProps) {
  const { clientRef, campusId: campusIdStr } = await params;
  const { filter = 'all' } = await searchParams;
  const campusId = Number(campusIdStr);
  if (Number.isNaN(campusId)) notFound();

  const client = await getClientByRef(clientRef);
  if (!client) notFound();

  const [campuses, referentiel, statuses] = await Promise.all([
    listCampusesForClient(client.id),
    getReferentiel(client.id),
    getDeliverableStatuses(client.id, campusId),
  ]);

  const campus = campuses.find((c) => c.id === campusId);
  if (!campus) notFound();

  // Index : deliverable_id -> status
  const statusByDeliverable = new Map(
    statuses.map((s) => [s.deliverable_id, s]),
  );

  // Calcule par critere : taux + nb indicateurs + prochaine echeance
  const criteriaWithStats = referentiel.criteria
    .filter((c) => filter === 'all' || c.criterion_type === filter)
    .map((criterion) => {
      const indicators =
        referentiel.indicatorsByCriterion.get(criterion.id) ?? [];
      const allDeliverables = indicators.flatMap(
        (i) => referentiel.deliverablesByIndicator.get(i.id) ?? [],
      );
      const statusesForCriterion = allDeliverables
        .map((d) => statusByDeliverable.get(d.id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s));

      const completion = computeCompletion(statusesForCriterion);
      const nextExpiry = statusesForCriterion
        .filter((s) => s.next_expiry)
        .map((s) => s.next_expiry!)
        .sort()[0];

      return {
        criterion,
        nbIndicators: indicators.length,
        nbDeliverables: allDeliverables.length,
        completion,
        nextExpiry,
      };
    });

  const globalCompletion = computeCompletion(statuses);
  const conformeCriteria = criteriaWithStats.filter(
    (c) => c.completion.valid,
  ).length;

  return (
    <div>
      <PageHeader
        title={`Qualiopi - ${client.raison_sociale}`}
        description={`${campus.denomination} · ${conformeCriteria}/${criteriaWithStats.length} critères conformes`}
      >
        <CriteriaFilter
          basePath={`/qualiopi/${clientRef}/${campusId}`}
          current={filter as 'all' | 'qualiopi' | 'eduvia'}
        />
      </PageHeader>

      {/* Barre de progression globale */}
      <Card className="mb-4 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-primary h-4 w-4" />
            <span className="text-sm font-medium">Complétion globale</span>
          </div>
          <span className="text-sm font-semibold tabular-nums">
            {globalCompletion.percent}% ({globalCompletion.conform}/
            {globalCompletion.total} livrables)
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--border-light)]">
          <div
            className="bg-primary h-full rounded-full transition-all"
            style={{ width: `${globalCompletion.percent}%` }}
          />
        </div>
      </Card>

      {/* Grille critères */}
      {criteriaWithStats.length === 0 ? (
        <Card className="p-10 text-center">
          <AlertTriangle className="text-muted-foreground mx-auto mb-3 h-8 w-8" />
          <p className="text-muted-foreground text-sm">
            Aucun critère à afficher. Vérifiez la clé API Eduvia.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {criteriaWithStats.map(
            ({
              criterion,
              nbIndicators,
              nbDeliverables,
              completion,
              nextExpiry,
            }) => (
              <Link
                key={criterion.id}
                href={`/qualiopi/${clientRef}/${campusId}/${criterion.id}`}
              >
                <Card className="hover:border-primary/50 group cursor-pointer overflow-hidden p-0 transition-colors">
                  <div className="flex">
                    {/* Bande couleur a gauche */}
                    <div
                      className="w-1 shrink-0"
                      style={{ background: criterion.color.primary }}
                    />
                    <div className="flex-1 p-4">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="rounded px-2 py-0.5 font-mono text-xs font-bold"
                            style={{
                              background: criterion.color.light,
                              color: criterion.color.primary,
                            }}
                          >
                            {criterion.prefix}
                          </span>
                          <StatusBadge
                            label={
                              criterion.criterion_type === 'qualiopi'
                                ? 'Qualiopi'
                                : 'Eduvia'
                            }
                            color={
                              criterion.criterion_type === 'qualiopi'
                                ? 'purple'
                                : 'blue'
                            }
                          />
                          <span className="text-sm font-semibold">
                            {criterion.title}
                          </span>
                        </div>
                        <StatusBadge
                          label={completion.valid ? 'Conforme' : 'Non conforme'}
                          color={completion.valid ? 'green' : 'orange'}
                        />
                      </div>
                      <p className="text-muted-foreground mb-3 line-clamp-2 text-xs">
                        {criterion.description}
                      </p>
                      <div className="text-muted-foreground mb-2 flex items-center gap-3 text-xs">
                        <span>{nbIndicators} indicateurs</span>
                        <span>·</span>
                        <span className="tabular-nums">
                          {completion.conform}/{nbDeliverables} livrables
                        </span>
                        {nextExpiry ? (
                          <>
                            <span>·</span>
                            <span>Échéance : {formatDateFr(nextExpiry)}</span>
                          </>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border-light)]">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${completion.percent}%`,
                              background: criterion.color.primary,
                            }}
                          />
                        </div>
                        <ChevronRight className="text-muted-foreground h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function formatDateFr(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
