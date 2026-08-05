import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { getPendingProposals } from '@/lib/queries/brain-proposals';
import { PageHeader } from '@/components/shared/page-header';
import { ProposalsReview } from './proposals-review';

export const metadata: Metadata = { title: 'Cerveau - SOLUVIA' };

export default async function AdminCerveauPage() {
  // user + propositions en parallele, comme /admin/syncs et /admin/bugs.
  // Un non-admin paye la query pour rien, mais la RLS de brain_proposals
  // ne lui renverrait rien de toute facon.
  const [user, proposals] = await Promise.all([
    getUser(),
    getPendingProposals(),
  ]);
  if (!isAdmin(user?.role)) redirect('/accueil');

  return (
    <div>
      <PageHeader
        title="Cerveau"
        description="Ce que le cerveau propose d'apprendre : à valider, corriger ou rejeter avant que ça devienne une connaissance de référence"
      />
      <ProposalsReview proposals={proposals} />
    </div>
  );
}
