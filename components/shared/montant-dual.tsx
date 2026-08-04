import { formatCurrency } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';

/**
 * Affichage double HT / TTC d'un montant (convention 2026-08 : chaque montant
 * visible porte les deux valeurs). La valeur principale reste le HT (les
 * libelles existants disent "HT"), le TTC est en ligne secondaire discrete.
 *
 * Le TTC doit venir des donnees reelles (somme de montant_ttc, paiements
 * bruts) ou du regime TVA du client pour les montants theoriques - jamais
 * d'un x1,2 aveugle (clients intracom a TVA 0%).
 */
export function MontantDual({
  ht,
  ttc,
  className,
  ttcClassName,
}: {
  ht: number;
  ttc: number;
  /** Classes de la valeur HT principale. */
  className?: string;
  /** Classes additionnelles de la ligne TTC. */
  ttcClassName?: string;
}) {
  return (
    <span className="inline-flex flex-col">
      <span className={className}>{formatCurrency(ht)}</span>
      <span
        className={cn(
          'text-muted-foreground text-[11px] leading-tight font-normal tabular-nums',
          ttcClassName,
        )}
      >
        {formatCurrency(ttc)} TTC
      </span>
    </span>
  );
}
