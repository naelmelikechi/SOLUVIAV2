import type { MockProjet } from '@/lib/mock-data';
import { formatDate } from '@/lib/utils/formatters';
import { Card } from '@/components/ui/card';

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <Card className="gap-1 p-4">
      <div className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        {label}
      </div>
      <div className={`text-lg font-semibold ${color || ''}`}>{value}</div>
      {sub && <div className="text-muted-foreground text-xs">{sub}</div>}
    </Card>
  );
}

export function ProjetStatCards({ projet }: { projet: MockProjet }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      <StatCard
        label="Typologie"
        value={projet.typologie.code}
        sub={projet.typologie.libelle}
      />
      <StatCard
        label="Client"
        value={projet.client.trigramme}
        sub={projet.client.raison_sociale}
      />
      <StatCard label="CDP" value={`${projet.cdp.prenom} ${projet.cdp.nom}`} />
      <StatCard
        label="Backup CDP"
        value={
          projet.backup_cdp
            ? `${projet.backup_cdp.prenom} ${projet.backup_cdp.nom}`
            : '—'
        }
      />
      <StatCard label="Date de debut" value={formatDate(projet.date_debut)} />
      <StatCard
        label="Apprentis actifs"
        value={String(projet.apprentis_actifs)}
        color="text-[var(--info)]"
      />
    </div>
  );
}
