import type { MockFinanceProjet } from '@/lib/mock-data';
import { formatCurrency } from '@/lib/utils/formatters';
import { Card } from '@/components/ui/card';

function FinanceStatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="text-center">
      <div className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}

export function ProjetFinanceSection({
  finance,
}: {
  finance: MockFinanceProjet | undefined;
}) {
  if (!finance) {
    return (
      <Card className="p-6">
        <h3 className="mb-2 text-sm font-semibold">Finance</h3>
        <p className="text-muted-foreground text-sm">
          Aucune donnee financiere
        </p>
      </Card>
    );
  }

  const commSoluvia = finance.taux_commission / 100;

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Finance</h3>
        <span className="text-primary rounded-full bg-[var(--primary-bg)] px-3 py-1 text-xs font-medium">
          Commission : {finance.taux_commission}%
        </span>
      </div>

      {/* OPCO Side */}
      <div className="mb-4">
        <div className="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
          Cote OPCO (Client)
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FinanceStatCard
            label="Production"
            value={finance.production_opco}
            color="text-[var(--warning)]"
          />
          <FinanceStatCard
            label="Facture"
            value={finance.facture_opco}
            color="text-[var(--warning)]"
          />
          <FinanceStatCard
            label="Encaisse"
            value={finance.encaisse_opco}
            color="text-primary"
          />
        </div>
      </div>

      {/* SOLUVIA Side */}
      <div>
        <div className="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
          Cote SOLUVIA ({finance.taux_commission}%)
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FinanceStatCard
            label="Production"
            value={finance.production_opco * commSoluvia}
            color="text-[var(--warning)]"
          />
          <FinanceStatCard
            label="Facture"
            value={finance.facture_opco * commSoluvia}
            color="text-[var(--warning)]"
          />
          <FinanceStatCard
            label="Encaisse"
            value={finance.encaisse_opco * commSoluvia}
            color="text-primary"
          />
        </div>
      </div>
    </Card>
  );
}
