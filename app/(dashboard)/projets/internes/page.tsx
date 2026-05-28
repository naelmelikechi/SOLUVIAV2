import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  getStatsInternes,
  getCategoriesInternes,
  getProjetsInternesList,
  type PeriodeInternes,
  type ScopeInternes,
} from '@/lib/queries/projets-internes';
import { getUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { PageHeader } from '@/components/shared/page-header';
import { PeriodScopeControls } from '@/components/projets-internes/period-scope-controls';
import {
  InternesTabs,
  InternesStatsPanel,
  InternesConfigPanel,
} from '@/components/projets-internes/internes-tabs';
import { InternesStatsTab } from '@/components/projets-internes/internes-stats-tab';
import { InternesConfigTab } from '@/components/projets-internes/internes-config-tab';

export const metadata: Metadata = { title: 'Projets internes - SOLUVIA' };
export const revalidate = 60;

interface SearchParams {
  periode?: string;
  scope?: string;
}

function parsePeriode(value: string | undefined): PeriodeInternes {
  if (
    value === 'mois' ||
    value === 'trimestre' ||
    value === 'annee' ||
    value === '12mois'
  ) {
    return value;
  }
  return 'mois';
}

function parseScope(
  value: string | undefined,
  allowEquipe: boolean,
): ScopeInternes {
  if (value === 'equipe' && allowEquipe) return 'equipe';
  return 'moi';
}

export default async function ProjetsInternesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getUser();
  if (!user) redirect('/login');

  const adminUser = isAdmin(user.role);
  const params = await searchParams;
  const periode = parsePeriode(params.periode);
  const scope = parseScope(params.scope, adminUser);

  const [stats, categories, projets] = await Promise.all([
    getStatsInternes({ periode, scope }),
    adminUser ? getCategoriesInternes(true) : Promise.resolve([]),
    adminUser ? getProjetsInternesList() : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader
        title="Projets internes"
        description="Heures non-billable (formation, intercontrat, support, R&D, etc.)"
      >
        <PeriodScopeControls
          periode={periode}
          scope={scope}
          showScope={adminUser}
        />
      </PageHeader>

      <InternesTabs hasConfiguration={adminUser}>
        <InternesStatsPanel>
          <InternesStatsTab stats={stats} scope={scope} />
        </InternesStatsPanel>
        {adminUser && (
          <InternesConfigPanel>
            <InternesConfigTab categories={categories} projets={projets} />
          </InternesConfigPanel>
        )}
      </InternesTabs>
    </div>
  );
}
