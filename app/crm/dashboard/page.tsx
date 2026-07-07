import Link from 'next/link';
import {
  BarChart3,
  BellRing,
  CalendarDays,
  History,
  MapPin,
} from 'lucide-react';
import { formatDate, formatDateTime, todayInParis } from '@/lib/crm/format';
import { dashboardData, dashboardRisks } from '@/lib/crm/queries/dashboard';
import {
  apprentisEnPipeline,
  conversionRate,
  computeFunnel,
  type OppLite,
} from '@/lib/crm/domain/pipeline';
import { KpiCards } from '@/components/crm/dashboard/kpi-cards';
import { FunnelChart } from '@/components/crm/dashboard/funnel-chart-lazy';
import { ActiviteRecente } from '@/components/crm/dashboard/activite-recente';
import { CarteRegions } from '@/components/crm/dashboard/carte-regions';
import { RiskCards } from '@/components/crm/dashboard/risk-cards';
import { type TimelineItem } from '@/components/crm/shared/timeline';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/crm/ui/card';

export default async function DashboardPage() {
  const [d, risks] = await Promise.all([dashboardData(), dashboardRisks()]);
  const today = todayInParis();
  const opps = d.opps as OppLite[];
  const apprentis = apprentisEnPipeline(opps);
  const ouvertes = opps.filter((o) => o.statut === 'ouverte').length;
  const conversion = conversionRate(opps);
  const funnel = computeFunnel(opps, d.etapes).map((f) => ({
    libelle: f.etape.libelle,
    count: f.count,
    couleur: f.etape.couleur ?? 'var(--primary)',
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>

      <KpiCards
        apprentis={apprentis}
        ouvertes={ouvertes}
        conversion={conversion}
        relancesDues={d.relancesDues.length}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="text-muted-foreground h-4 w-4" />
              Pipeline par étape
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FunnelChart data={funnel} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BellRing className="text-muted-foreground h-4 w-4" />À relancer
              {d.relancesDues.length > 0 && (
                <span className="bg-warning/15 text-warning ml-auto rounded-full px-2 py-0.5 text-xs font-medium">
                  {d.relancesDues.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {d.relancesDues.length ? (
              d.relancesDues.map((r) => {
                const overdue = r.date_echeance < today;
                return (
                  <Link
                    key={r.id}
                    href="/crm/relances"
                    className="hover:bg-accent/60 -mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors"
                  >
                    <span className="truncate">{r.titre}</span>
                    <span
                      className={`shrink-0 text-xs ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}
                    >
                      {formatDate(r.date_echeance)}
                      {overdue ? ' (retard)' : ''}
                    </span>
                  </Link>
                );
              })
            ) : (
              <p className="text-muted-foreground py-6 text-center">
                Rien à relancer 🎉
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <RiskCards
        dormantes={risks.dormantes}
        rdvADebriefer={risks.rdvADebriefer}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="text-muted-foreground h-4 w-4" />
            Densité géographique
            <span className="text-muted-foreground ml-auto text-xs font-normal">
              opportunités ouvertes
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CarteRegions opps={d.densiteOpps} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="text-muted-foreground h-4 w-4" />
              Prochains RDV
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {d.prochainRdv.length ? (
              d.prochainRdv.map((r) => (
                <Link
                  key={r.id}
                  href={`/crm/rdv?rdv=${r.id}`}
                  className="hover:bg-accent/60 -mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors"
                >
                  <span className="truncate">{r.titre}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatDateTime(r.debut)}
                  </span>
                </Link>
              ))
            ) : (
              <p className="text-muted-foreground py-6 text-center">
                Aucun RDV à venir.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="text-muted-foreground h-4 w-4" />
              Activité récente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActiviteRecente
              recentes={d.activitesRecentes as unknown as TimelineItem[]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
