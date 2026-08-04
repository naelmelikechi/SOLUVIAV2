import Link from 'next/link';
import { Moon, ClipboardList } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTimeParis } from '@/lib/utils/formatters';
import type { DashboardRisks } from '@/lib/crm/queries/dashboard';

export function RiskCards({
  dormantes,
  rdvADebriefer,
  dormantesTotal,
  rdvADebrieferTotal,
}: DashboardRisks) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Moon className="text-muted-foreground h-4 w-4" />
            Opportunités dormantes
            {dormantesTotal > 0 && (
              <span className="bg-warning/15 text-warning ml-auto rounded-full px-2 py-0.5 text-xs font-medium">
                {dormantesTotal}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {dormantes.length ? (
            dormantes.map((d) => (
              <Link
                key={d.id}
                href={`/crm/pipeline?opp=${d.id}`}
                className="hover:bg-accent/60 -mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors"
              >
                <span className="truncate">{d.compte ?? d.intitule}</span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {d.joursInactif} j sans action
                </span>
              </Link>
            ))
          ) : (
            <p className="text-muted-foreground py-6 text-center">
              Aucune opportunité dormante 🎉
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="text-muted-foreground h-4 w-4" />
            RDV à débriefer
            {rdvADebrieferTotal > 0 && (
              <span className="bg-warning/15 text-warning ml-auto rounded-full px-2 py-0.5 text-xs font-medium">
                {rdvADebrieferTotal}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {rdvADebriefer.length ? (
            rdvADebriefer.map((r) => (
              <Link
                key={r.id}
                href={`/crm/rdv?rdv=${r.id}`}
                className="hover:bg-accent/60 -mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors"
              >
                <span className="truncate">
                  {r.titre}
                  {r.compte ? ` · ${r.compte}` : ''}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {formatDateTimeParis(r.debut)}
                </span>
              </Link>
            ))
          ) : (
            <p className="text-muted-foreground py-6 text-center">
              Tous les RDV sont débriefés ✅
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
