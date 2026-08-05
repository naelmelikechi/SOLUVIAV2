import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import {
  getPendingProposals,
  getDecidedProposals,
} from '@/lib/queries/brain-proposals';
import { PageHeader } from '@/components/shared/page-header';
import { cn } from '@/lib/utils';
import { ProposalsReview } from './proposals-review';
import { ProposalsHistory } from './proposals-history';

export const metadata: Metadata = { title: 'Cerveau - SOLUVIA' };

type CerveauTab = 'valider' | 'historique';

const TABS: { key: CerveauTab; label: string }[] = [
  { key: 'valider', label: 'À valider' },
  { key: 'historique', label: 'Historique' },
];

function parseTab(value: string | undefined): CerveauTab {
  return value === 'historique' ? 'historique' : 'valider';
}

export default async function AdminCerveauPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const currentTab = parseTab(tab);

  // user + donnees de l'onglet courant en parallele, comme /admin/syncs et
  // /admin/bugs. Un non-admin paye la query pour rien, mais la RLS de
  // brain_proposals ne lui renverrait rien de toute facon.
  const [user, proposals, decided] = await Promise.all([
    getUser(),
    currentTab === 'valider' ? getPendingProposals() : [],
    currentTab === 'historique' ? getDecidedProposals() : [],
  ]);
  if (!isAdmin(user?.role)) redirect('/accueil');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cerveau"
        description="Ce que le cerveau propose d'apprendre : à valider, corriger ou rejeter avant que ça devienne une connaissance de référence"
      />

      <div className="border-border flex items-center gap-1 border-b">
        {TABS.map((t) => {
          const isActive = t.key === currentTab;
          return (
            <Link
              key={t.key}
              href={
                t.key === 'valider'
                  ? '/admin/cerveau'
                  : `/admin/cerveau?tab=${t.key}`
              }
              className={cn(
                'flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground border-transparent',
              )}
            >
              <span>{t.label}</span>
            </Link>
          );
        })}
      </div>

      {currentTab === 'valider' ? (
        <ProposalsReview proposals={proposals} />
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            Les 100 arbitrages les plus récents. Un rejet est durable — la
            proposition ne sera pas reproposée tant que son contenu ne change
            pas : « Rouvrir » est le seul moyen de revenir sur un rejet fait par
            erreur.
          </p>
          <ProposalsHistory rows={decided} />
        </>
      )}
    </div>
  );
}
