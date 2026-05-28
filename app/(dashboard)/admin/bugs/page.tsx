import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import {
  getBugReports,
  getBugReportCounts,
  type BugFilter,
} from '@/lib/queries/bug-reports';
import { PageHeader } from '@/components/shared/page-header';
import { cn } from '@/lib/utils';
import { BugsTable } from './bugs-table';

export const metadata: Metadata = { title: 'Bugs - SOLUVIA' };

const TABS: { key: BugFilter; label: string }[] = [
  { key: 'open', label: 'Ouverts' },
  { key: 'closed', label: 'Fermés' },
  { key: 'all', label: 'Tous' },
];

function parseTab(value: string | undefined): BugFilter {
  if (value === 'closed' || value === 'all') return value;
  return 'open';
}

export default async function AdminBugsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const currentTab = parseTab(tab);

  // user + reports + counts en parallele.
  const [user, reports, counts] = await Promise.all([
    getUser(),
    getBugReports(currentTab),
    getBugReportCounts(),
  ]);
  if (!isAdmin(user?.role)) redirect('/projets');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bugs signalés"
        description="Rapports envoyés par les utilisateurs avec analyse IA."
      />

      <div className="border-border flex items-center gap-1 border-b">
        {TABS.map((t) => {
          const isActive = t.key === currentTab;
          const count = counts[t.key];
          return (
            <Link
              key={t.key}
              href={
                t.key === 'open' ? '/admin/bugs' : `/admin/bugs?tab=${t.key}`
              }
              className={cn(
                'flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground border-transparent',
              )}
            >
              <span>{t.label}</span>
              <span
                className={cn(
                  'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      <BugsTable reports={reports} />
    </div>
  );
}
