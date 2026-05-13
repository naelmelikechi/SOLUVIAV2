import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, User } from 'lucide-react';
import {
  getAssignments,
  getClientByRef,
  getDeliverableStatuses,
  getReferentiel,
  listCampusesForClient,
} from '@/lib/queries/qualiopi';
import { computeCompletion } from '@/lib/eduvia/quality-types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ clientRef: string; criterionId: string }>;
}): Promise<Metadata> {
  const { clientRef, criterionId } = await params;
  const client = await getClientByRef(clientRef);
  return {
    title: client
      ? `Critère ${criterionId} - ${client.raison_sociale} - SOLUVIA`
      : 'Qualité - SOLUVIA',
  };
}

export default async function CriterionPage({
  params,
}: {
  params: Promise<{
    clientRef: string;
    campusId: string;
    criterionId: string;
  }>;
}) {
  const p = await params;
  const campusId = Number(p.campusId);
  const criterionId = Number(p.criterionId);
  if (Number.isNaN(campusId) || Number.isNaN(criterionId)) notFound();

  const client = await getClientByRef(p.clientRef);
  if (!client) notFound();

  const [campuses, referentiel, statuses, assignments] = await Promise.all([
    listCampusesForClient(client.id),
    getReferentiel(client.id),
    getDeliverableStatuses(client.id, campusId),
    getAssignments(client.id, campusId),
  ]);
  const campus = campuses.find((c) => c.id === campusId);
  const criterion = referentiel.criteria.find((c) => c.id === criterionId);
  if (!campus || !criterion) notFound();

  const indicators = referentiel.indicatorsByCriterion.get(criterionId) ?? [];
  const allDeliverables = indicators.flatMap(
    (i) => referentiel.deliverablesByIndicator.get(i.id) ?? [],
  );
  const statusByDeliverable = new Map(
    statuses.map((s) => [s.deliverable_id, s]),
  );
  const statusesForCriterion = allDeliverables
    .map((d) => statusByDeliverable.get(d.id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const totalCompletion = computeCompletion(
    statusesForCriterion,
    allDeliverables.length,
  );
  const indicatorsNonConforme = indicators.filter((i) => {
    const dels = referentiel.deliverablesByIndicator.get(i.id) ?? [];
    const sts = dels
      .map((d) => statusByDeliverable.get(d.id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
    return !computeCompletion(sts, dels.length).valid;
  }).length;

  const nextExpiry = statusesForCriterion
    .filter((s) => s.next_expiry)
    .map((s) => s.next_expiry!)
    .sort()[0];

  return (
    <div>
      {/* Header avec retour */}
      <div className="mb-4">
        <Link href={`/qualiopi/${p.clientRef}/${campusId}`}>
          <Button variant="ghost" size="sm" className="-ml-2">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Retour
          </Button>
        </Link>
      </div>

      <div className="mb-4 flex items-start gap-4">
        <span
          className="rounded px-3 py-2 font-mono text-base font-bold"
          style={{
            background: criterion.color.light,
            color: criterion.color.primary,
          }}
        >
          {criterion.prefix}
        </span>
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h1 className="text-xl font-semibold">{criterion.title}</h1>
            <StatusBadge
              label={
                criterion.criterion_type === 'qualiopi' ? 'Qualiopi' : 'Eduvia'
              }
              color={
                criterion.criterion_type === 'qualiopi' ? 'purple' : 'blue'
              }
            />
            <StatusBadge
              label={totalCompletion.valid ? 'Conforme' : 'Non conforme'}
              color={totalCompletion.valid ? 'green' : 'orange'}
            />
          </div>
          <p className="text-muted-foreground text-sm">
            Qualité - {campus.denomination}
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            {criterion.description}
          </p>
        </div>
      </div>

      {/* 4 cartes metriques */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Indicateurs"
          value={String(indicators.length)}
          sub="total"
        />
        <MetricTile
          label="Livrables conformes"
          value={`${totalCompletion.conform}/${totalCompletion.total}`}
          sub={`${totalCompletion.percent}%`}
        />
        <MetricTile
          label="Indicateurs non conformes"
          value={String(indicatorsNonConforme)}
          tone={indicatorsNonConforme > 0 ? 'warn' : 'good'}
        />
        <MetricTile
          label="Prochaine échéance"
          value={nextExpiry ? formatDateFr(nextExpiry) : '-'}
          sub={nextExpiry ? '' : 'Aucune'}
        />
      </div>

      {/* Liste indicateurs */}
      <div className="grid gap-3 lg:grid-cols-2">
        {indicators.map((indicator) => {
          const dels =
            referentiel.deliverablesByIndicator.get(indicator.id) ?? [];
          const sts = dels
            .map((d) => statusByDeliverable.get(d.id))
            .filter((s): s is NonNullable<typeof s> => Boolean(s));
          const c = computeCompletion(sts, dels.length);
          const exp = sts
            .filter((s) => s.next_expiry)
            .map((s) => s.next_expiry!)
            .sort()[0];
          const assignment = assignments.get(indicator.id);

          return (
            <Link
              key={indicator.id}
              href={`/qualiopi/${p.clientRef}/${campusId}/${criterionId}/${indicator.id}`}
            >
              <Card className="hover:border-primary/50 group cursor-pointer p-4 transition-colors">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 font-mono text-xs font-semibold ${
                        c.valid
                          ? 'bg-green-100 text-green-800'
                          : 'bg-orange-100 text-orange-800'
                      }`}
                    >
                      {indicator.code}
                    </span>
                    <span className="text-sm font-semibold">
                      {indicator.title}
                    </span>
                  </div>
                  <ChevronRight className="text-muted-foreground h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <div className="text-muted-foreground mb-2 flex items-center gap-3 text-xs">
                  {assignment?.user ? (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {assignment.user.prenom} {assignment.user.nom}
                    </span>
                  ) : (
                    <span className="italic">Aucun responsable</span>
                  )}
                  {exp ? <span>Échéance : {formatDateFr(exp)}</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border-light)]">
                    <div
                      className={`h-full rounded-full ${
                        c.valid ? 'bg-green-500' : 'bg-orange-400'
                      }`}
                      style={{ width: `${c.percent}%` }}
                    />
                  </div>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {c.conform}/{c.total} livrables
                  </span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'warn' | 'neutral';
}) {
  const valueClass =
    tone === 'good'
      ? 'text-primary'
      : tone === 'warn'
        ? 'text-[var(--warning)]'
        : 'text-foreground';
  return (
    <Card className="p-4">
      <div className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>
        {value}
      </div>
      {sub ? (
        <div className="text-muted-foreground mt-0.5 text-xs">{sub}</div>
      ) : null}
    </Card>
  );
}

// timeZone explicite : sans cela les workers Vercel (UTC) affichent une
// date decalee d un jour pour les ISO proches de minuit.
const DATE_FMT_FR = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function formatDateFr(iso: string): string {
  return DATE_FMT_FR.format(new Date(iso));
}
