import Link from 'next/link';
import type { ProjetDetail } from '@/lib/queries/projets';
import { formatDate } from '@/lib/utils/formatters';
import { Card } from '@/components/ui/card';

function StatCard({
  label,
  value,
  sub,
  color,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  href?: string;
}) {
  const content = (
    <>
      <div className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        {label}
      </div>
      <div
        className={`text-lg font-semibold ${color || ''} ${
          href ? 'group-hover:underline' : ''
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-muted-foreground text-xs">{sub}</div>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="group">
        <Card className="hover:border-primary/30 gap-1 p-4 transition-colors">
          {content}
        </Card>
      </Link>
    );
  }

  return <Card className="gap-1 p-4">{content}</Card>;
}

export function ProjetStatCards({
  projet,
  apprentisActifs,
}: {
  projet: ProjetDetail;
  apprentisActifs: number;
}) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      <StatCard
        label="Typologie"
        value={projet.typologie?.code ?? '-'}
        sub={projet.typologie?.libelle ?? undefined}
      />
      <StatCard
        label="Client"
        value={projet.client?.trigramme ?? '-'}
        sub={projet.client?.raison_sociale ?? undefined}
        href={projet.client ? `/admin/clients/${projet.client.id}` : undefined}
      />
      <StatCard
        label="CDP"
        value={projet.cdp ? `${projet.cdp.prenom} ${projet.cdp.nom}` : '-'}
        href={projet.cdp ? '/admin/utilisateurs' : undefined}
      />
      <StatCard
        label="Backup CDP"
        value={
          projet.backup_cdp
            ? `${projet.backup_cdp.prenom} ${projet.backup_cdp.nom}`
            : '-'
        }
        href={projet.backup_cdp ? '/admin/utilisateurs' : undefined}
      />
      <StatCard
        label="Date de début"
        value={projet.date_debut ? formatDate(projet.date_debut) : '-'}
      />
      <StatCard
        label="Apprentis actifs"
        value={String(apprentisActifs)}
        color="text-[var(--info)]"
      />
    </div>
  );
}
