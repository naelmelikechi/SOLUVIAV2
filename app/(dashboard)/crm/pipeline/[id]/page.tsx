import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { listEtapes, getOpportunite } from '@/lib/crm/queries/opportunites';
import { commercialOptions } from '@/lib/crm/queries/rdv';
import { cachedGetUser } from '@/lib/crm/auth/roles';
import { isHiddenEmail } from '@/lib/crm/auth/hidden';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import {
  OppDetailBody,
  type OppDetail,
} from '@/components/crm/pipeline/opp-detail-body';

export const metadata: Metadata = { title: 'Opportunité - SOLUVIA' };

// Fiche complète d'une opportunité (doctrine disclosure : une entité avec
// cycle de vie a sa propre URL). Le Sheet du pipeline reste le coup d'oeil.
export default async function OppDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [etapes, selected, mentionOptions, user] = await Promise.all([
    listEtapes(),
    getOpportunite(id).catch(() => null),
    commercialOptions().catch(() => []),
    cachedGetUser(),
  ]);
  if (!selected) notFound();
  const opp = selected as unknown as OppDetail;
  const canNote = !isHiddenEmail(user?.email);

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumbs
        items={[
          { label: 'Pipeline', href: '/crm/pipeline' },
          { label: opp.intitule },
        ]}
      />
      <h1 className="mb-4 text-xl font-semibold tracking-tight">
        {opp.intitule}
      </h1>
      <OppDetailBody
        opp={opp}
        etapes={etapes}
        mentionOptions={mentionOptions}
        canNote={canNote}
      />
    </div>
  );
}
