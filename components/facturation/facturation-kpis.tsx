import { Card } from '@/components/ui/card';
import { formatCurrency, formatMoisConcerne } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import type { FacturationKpis } from '@/lib/queries/factures';

// Bandeau d'état de la facturation : 4 cellules simples et parlantes.
// Chaque montant porte le HT (valeur principale, convention) ET le TTC
// (valeurs PDF des factures, sommées telles quelles - zéro recalcul).
function KpiCell({
  label,
  value,
  ttc,
  hint,
  accent,
}: {
  label: string;
  value: string;
  /** Équivalent TTC (déjà formaté), affiché en ligne secondaire. */
  ttc?: string;
  hint: string;
  accent?: string;
}) {
  return (
    <div className="px-4 py-3 sm:px-5">
      <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 text-xl leading-tight font-semibold tabular-nums',
          accent,
        )}
      >
        {value}
        <span className="text-muted-foreground ml-1 text-[11px] font-normal">
          HT
        </span>
      </p>
      {ttc && (
        <p className="text-muted-foreground text-[11px] tabular-nums">
          {ttc} TTC
        </p>
      )}
      <p className="text-muted-foreground text-[11px]">{hint}</p>
    </div>
  );
}

export function FacturationKpisStrip({
  kpis,
  aEmettreCount,
  aEmettreMontantHt,
  aEmettreMontantTtc,
}: {
  kpis: FacturationKpis;
  aEmettreCount: number;
  aEmettreMontantHt: number;
  aEmettreMontantTtc: number;
}) {
  const moisLabel = formatMoisConcerne(new Date().toISOString().slice(0, 7));
  return (
    <Card className="divide-border grid gap-0 divide-y p-0 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
      <KpiCell
        label={`Facturé en ${moisLabel.toLowerCase()}`}
        value={formatCurrency(kpis.factureMois.montantHt)}
        ttc={formatCurrency(kpis.factureMois.montantTtc)}
        hint={`${kpis.factureMois.count} facture${kpis.factureMois.count > 1 ? 's' : ''} émise${kpis.factureMois.count > 1 ? 's' : ''} (avoirs déduits)`}
      />
      <KpiCell
        label="En attente de paiement"
        value={formatCurrency(kpis.enAttente.montantHt)}
        ttc={formatCurrency(kpis.enAttente.montantTtc)}
        hint={`${kpis.enAttente.count} facture${kpis.enAttente.count > 1 ? 's' : ''} émise${kpis.enAttente.count > 1 ? 's' : ''} non payée${kpis.enAttente.count > 1 ? 's' : ''}`}
      />
      <KpiCell
        label="En retard"
        value={formatCurrency(kpis.enRetard.montantHt)}
        ttc={formatCurrency(kpis.enRetard.montantTtc)}
        hint={
          kpis.enRetard.count > 0
            ? `${kpis.enRetard.count} facture${kpis.enRetard.count > 1 ? 's' : ''} à relancer`
            : 'aucun retard de paiement'
        }
        accent={
          kpis.enRetard.count > 0 ? 'text-red-600 dark:text-red-400' : undefined
        }
      />
      <KpiCell
        label="À émettre"
        value={formatCurrency(aEmettreMontantHt)}
        ttc={formatCurrency(aEmettreMontantTtc)}
        hint={
          aEmettreCount > 0
            ? `${aEmettreCount} facture${aEmettreCount > 1 ? 's' : ''} en préparation`
            : 'rien en préparation'
        }
        accent={
          aEmettreCount > 0 ? 'text-orange-600 dark:text-orange-400' : undefined
        }
      />
    </Card>
  );
}
