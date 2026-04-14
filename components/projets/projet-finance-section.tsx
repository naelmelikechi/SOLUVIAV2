import type { ProjetFinance } from '@/lib/queries/projets';
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
  finance: ProjetFinance | null;
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

  const raf_opco = finance.production_opco - finance.facture_opco;
  const rae_opco = finance.facture_opco - finance.encaisse_opco;

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
      <div className="mb-4">
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

      {/* RAF / RAE / En retard */}
      <div className="border-border border-t pt-4">
        <div className="grid grid-cols-3 gap-4">
          <FinanceStatCard
            label="RAF (Reste a facturer)"
            value={raf_opco}
            color={
              raf_opco > 0 ? 'text-[var(--warning)]' : 'text-muted-foreground'
            }
          />
          <FinanceStatCard
            label="RAE (Reste a encaisser)"
            value={rae_opco}
            color={
              rae_opco > 0 ? 'text-[var(--warning)]' : 'text-muted-foreground'
            }
          />
          <FinanceStatCard
            label="En retard"
            value={finance.en_retard}
            color={
              finance.en_retard > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-muted-foreground'
            }
          />
        </div>
      </div>
    </Card>
  );
}
