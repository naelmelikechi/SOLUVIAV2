import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import {
  getIndicateursScope,
  type Period,
  type TechPeriod,
} from '@/lib/queries/indicateurs';
import { CdpSection } from '@/components/indicateurs/cdp-section';
import { CommercialSection } from '@/components/indicateurs/commercial-section';
import { TechSection } from '@/components/indicateurs/tech-section';

export const metadata: Metadata = { title: 'Indicateurs - SOLUVIA' };
export const revalidate = 60;

interface IndicateursPageProps {
  searchParams: Promise<{ p?: string; t?: string }>;
}

function getDescription(kind: 'admin' | 'cdp' | 'commercial'): string {
  switch (kind) {
    case 'admin':
      return 'Pilotage des ratios CDP, activité commerciale et livraison produit';
    case 'cdp':
      return 'Ratios de vos CFA et suivi des idées produit';
    case 'commercial':
      return 'Votre activité commerciale et suivi des idées produit';
  }
}

function parsePeriod(raw: string | undefined): Period {
  return raw === 'month' ? 'month' : 'week';
}

function parseTechPeriod(raw: string | undefined): TechPeriod {
  return raw === 'month' ? 'month' : 'cycle';
}

export default async function IndicateursPage({
  searchParams,
}: IndicateursPageProps) {
  const scope = await getIndicateursScope();
  if (!scope) {
    notFound();
  }

  const params = await searchParams;
  const period = parsePeriod(params.p);
  const techPeriod = parseTechPeriod(params.t);

  const showCdp = scope.kind === 'admin' || scope.kind === 'cdp';
  const showCommercial = scope.kind === 'admin' || scope.kind === 'commercial';
  const showTech = true;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Indicateurs"
        description={getDescription(scope.kind)}
      />

      {showCdp && <CdpSection scope={scope} period={period} />}
      {showCommercial && <CommercialSection scope={scope} />}
      {showTech && <TechSection period={techPeriod} />}
    </div>
  );
}
