import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  getAssignments,
  getClientByRef,
  getDeliverableStatuses,
  getEvidenceNotes,
  getEvidences,
  getReferentiel,
  listCampusesForClient,
} from '@/lib/queries/qualiopi';
import { getActiveUsersMinimal } from '@/lib/queries/users';
import { computeCompletion } from '@/lib/eduvia/quality-types';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { IndicatorClient } from '@/components/qualiopi/indicator-client';
import { NoticeIframe } from '@/components/qualiopi/notice-iframe';

export const revalidate = 30;

export default async function IndicatorPage({
  params,
  searchParams,
}: {
  params: Promise<{
    clientRef: string;
    campusId: string;
    criterionId: string;
    indicatorId: string;
  }>;
  searchParams: Promise<{ d?: string }>;
}) {
  const p = await params;
  const sp = await searchParams;
  const campusId = Number(p.campusId);
  const criterionId = Number(p.criterionId);
  const indicatorId = Number(p.indicatorId);
  if (
    Number.isNaN(campusId) ||
    Number.isNaN(criterionId) ||
    Number.isNaN(indicatorId)
  )
    notFound();

  const client = await getClientByRef(p.clientRef);
  if (!client) notFound();

  const [campuses, referentiel, statuses, assignments, users] =
    await Promise.all([
      listCampusesForClient(client.id),
      getReferentiel(client.id),
      getDeliverableStatuses(client.id, campusId),
      getAssignments(client.id, campusId),
      getActiveUsersMinimal(),
    ]);
  const campus = campuses.find((c) => c.id === campusId);
  const criterion = referentiel.criteria.find((c) => c.id === criterionId);
  const indicator = (
    referentiel.indicatorsByCriterion.get(criterionId) ?? []
  ).find((i) => i.id === indicatorId);
  if (!campus || !criterion || !indicator) notFound();

  const deliverables =
    referentiel.deliverablesByIndicator.get(indicatorId) ?? [];
  const statusByDeliverable = new Map(
    statuses.map((s) => [s.deliverable_id, s]),
  );
  const completion = computeCompletion(
    deliverables
      .map((d) => statusByDeliverable.get(d.id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s)),
  );

  // Recupere les evidences du livrable selectionne (si applicable)
  const selectedDeliverableId = sp.d ? Number(sp.d) : null;
  let selectedDeliverable = null;
  let selectedEvidences: Awaited<ReturnType<typeof getEvidences>> = [];
  let evidenceNotes: Awaited<ReturnType<typeof getEvidenceNotes>> = new Map();
  if (
    selectedDeliverableId &&
    !Number.isNaN(selectedDeliverableId) &&
    deliverables.some((d) => d.id === selectedDeliverableId)
  ) {
    selectedDeliverable =
      deliverables.find((d) => d.id === selectedDeliverableId) ?? null;
    selectedEvidences = await getEvidences(
      client.id,
      campusId,
      selectedDeliverableId,
    );
    if (selectedEvidences.length > 0) {
      evidenceNotes = await getEvidenceNotes(
        client.id,
        selectedEvidences.map((e) => e.id),
      );
    }
  }

  // Recompute defensif des statuts via les evidences (workaround bug expiration Eduvia)
  const deliverablesWithStatus = deliverables.map((d) => {
    const apiStatus = statusByDeliverable.get(d.id);
    return {
      deliverable: d,
      status: apiStatus,
    };
  });

  const assignment = assignments.get(indicator.id);

  return (
    <div>
      <div className="mb-4">
        <Link href={`/qualiopi/${p.clientRef}/${campusId}/${criterionId}`}>
          <Button variant="ghost" size="sm" className="-ml-2">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {criterion.title}
          </Button>
        </Link>
      </div>

      <div className="mb-6 flex items-start gap-4">
        <span
          className={`rounded px-3 py-2 font-mono text-sm font-bold ${
            completion.valid
              ? 'bg-green-100 text-green-800'
              : 'bg-orange-100 text-orange-800'
          }`}
        >
          {indicator.code}
        </span>
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h1 className="text-xl font-semibold">{indicator.title}</h1>
            <StatusBadge
              label={completion.valid ? 'Conforme' : 'Non conforme'}
              color={completion.valid ? 'green' : 'orange'}
            />
          </div>
          <p className="text-muted-foreground text-sm">
            {campus.denomination} · {completion.conform}/{completion.total}{' '}
            livrables conformes
          </p>
        </div>
      </div>

      <NoticeIframe kind="indicateur" code={indicator.code} />

      <IndicatorClient
        clientId={client.id}
        clientRef={p.clientRef}
        campusId={campusId}
        criterionId={criterionId}
        indicatorId={indicator.id}
        indicatorCode={indicator.code}
        deliverables={deliverablesWithStatus}
        selectedDeliverableId={selectedDeliverable?.id ?? null}
        selectedEvidences={selectedEvidences}
        evidenceNotes={evidenceNotes}
        currentAssignment={assignment ?? null}
        availableUsers={users}
      />
    </div>
  );
}
