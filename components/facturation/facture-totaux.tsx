import { formatCurrency } from '@/lib/utils/formatters';

interface FactureTotauxProps {
  montant_ht: number;
  taux_tva: number;
  montant_tva: number;
  montant_ttc: number;
  est_avoir: boolean;
}

export function FactureTotaux({
  montant_ht,
  taux_tva,
  montant_tva,
  montant_ttc,
  est_avoir,
}: FactureTotauxProps) {
  const amountClass = est_avoir ? 'text-red-600 dark:text-red-400' : '';

  return (
    <div className="flex justify-end">
      <div className="w-64 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Sous-total HT</span>
          <span className={`font-mono ${amountClass}`}>
            {est_avoir ? '- ' : ''}
            {formatCurrency(montant_ht)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">TVA {taux_tva}%</span>
          <span className={`font-mono ${amountClass}`}>
            {est_avoir ? '- ' : ''}
            {formatCurrency(montant_tva)}
          </span>
        </div>
        <div className="border-t pt-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Total TTC</span>
            <span className={`font-mono text-base font-bold ${amountClass}`}>
              {est_avoir ? '- ' : ''}
              {formatCurrency(montant_ttc)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
