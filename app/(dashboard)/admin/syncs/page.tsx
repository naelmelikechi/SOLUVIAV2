import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import {
  getEduviaSyncHealth,
  getOdooSyncHealth,
  getRecentSyncRuns,
} from '@/lib/queries/syncs';
import { PageHeader } from '@/components/shared/page-header';
import { EduviaHealthCards } from '@/components/admin/syncs/eduvia-health-cards';
import { OdooHealthCard } from '@/components/admin/syncs/odoo-health-card';
import { SyncRunsTable } from '@/components/admin/syncs/sync-runs-table';

export const metadata: Metadata = {
  title: 'Santé des synchronisations - SOLUVIA',
};

export default async function SyncsPage() {
  // user + queries en parallele. Si non-admin on paye les queries pour rien
  // (cas rare : la page est gatee par la sidebar, et la RLS des tables de
  // logs renvoie 0 ligne aux non-admins de toute facon).
  const [user, eduviaHealth, odooHealth, recentRuns] = await Promise.all([
    getUser(),
    getEduviaSyncHealth(),
    getOdooSyncHealth(),
    getRecentSyncRuns(),
  ]);
  if (!isAdmin(user?.role)) {
    redirect('/projets');
  }

  return (
    <div>
      <PageHeader
        title="Santé des synchronisations"
        description="État des syncs Eduvia et Odoo : derniers runs, durées et erreurs"
      />

      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Eduvia - par client</h2>
          <EduviaHealthCards health={eduviaHealth} />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Odoo</h2>
          <OdooHealthCard health={odooHealth} />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Derniers runs Eduvia</h2>
          <SyncRunsTable data={recentRuns} />
        </section>
      </div>
    </div>
  );
}
