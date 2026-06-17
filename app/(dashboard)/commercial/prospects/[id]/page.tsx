import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  getProspectById,
  getProspectContacts,
  getProspectNotes,
  getProspectCommunications,
  getProspectStageHistory,
  getCommerciaux,
} from '@/lib/queries/prospects';
import { getRdvCommerciauxByProspectId } from '@/lib/queries/rdv';
import { getSignatureRequestsByProspect } from '@/lib/queries/signatures';
import { createClient } from '@/lib/supabase/server';
import { canAccessPipeline, isAdmin } from '@/lib/utils/roles';
import { FicheHeader } from '@/components/commercial/fiche/fiche-header';
import { FicheTabs } from '@/components/commercial/fiche/fiche-tabs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const prospect = await getProspectById(id);
  return {
    title: prospect
      ? `${prospect.nom} - Prospects - SOLUVIA`
      : 'Prospect - SOLUVIA',
  };
}

export default async function ProspectDetailPage({
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

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, pipeline_access')
    .eq('id', user.id)
    .single();

  if (!canAccessPipeline(currentUser?.role, currentUser?.pipeline_access)) {
    redirect('/projets');
  }

  const [
    prospect,
    contacts,
    rdvs,
    notes,
    communications,
    stageHistory,
    commerciaux,
    signatures,
  ] = await Promise.all([
    getProspectById(id),
    getProspectContacts(id),
    getRdvCommerciauxByProspectId(id),
    getProspectNotes(id),
    getProspectCommunications(id),
    getProspectStageHistory(id),
    getCommerciaux(),
    getSignatureRequestsByProspect(id),
  ]);

  if (!prospect) {
    notFound();
  }

  return (
    <div>
      <Link
        href="/commercial/prospects"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        Retour
      </Link>

      <FicheHeader prospect={prospect} />

      <FicheTabs
        prospect={prospect}
        contacts={contacts}
        rdvs={rdvs}
        notes={notes ?? []}
        communications={communications}
        stageHistory={stageHistory}
        commerciaux={commerciaux}
        currentUserId={user.id}
        isAdmin={isAdmin(currentUser?.role)}
        signatures={signatures}
      />
    </div>
  );
}
