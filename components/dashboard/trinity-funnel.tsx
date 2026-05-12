import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/formatters';

export interface TrinityFunnelProps {
  production: number;
  facture: number;
  encaisse: number;
  productionTrend: number;
  editMode?: boolean;
  onHide?: () => void;
}

function pct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

export function TrinityFunnel({
  production,
  facture,
  encaisse,
  productionTrend,
  editMode,
  onHide,
}: TrinityFunnelProps) {
  const pctFacture = pct(facture, production);
  const pctEncaisse = pct(encaisse, production);
  const resteAFacturer = Math.max(0, production - facture);
  const enAttentePaiement = Math.max(0, facture - encaisse);
  const trendUp = productionTrend > 0;

  return (
    <div className="border-border/60 bg-border/60 relative grid grid-cols-1 gap-px overflow-hidden rounded-xl border md:grid-cols-3">
      {editMode && (
        <button
          type="button"
          onClick={() => onHide?.()}
          aria-label="Masquer le funnel"
          className="bg-background border-border hover:bg-destructive hover:text-destructive-foreground absolute top-2 right-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs"
        >
          ×
        </button>
      )}

      {/* Card 1 - Production */}
      <div className="from-card to-muted/30 bg-gradient-to-b p-5">
        <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
          Production
        </div>
        <div className="num mt-2 text-3xl font-bold tracking-tight">
          {formatCurrency(production)}
        </div>
        {productionTrend !== 0 && (
          <div
            className={cn(
              'mt-1 flex items-center gap-1 text-xs font-semibold',
              trendUp
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400',
            )}
          >
            {trendUp ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            <span className="num">
              vs M-1 : {trendUp ? '+' : ''}
              {productionTrend}%
            </span>
          </div>
        )}
        <div className="bg-muted/40 mt-3 h-1 overflow-hidden rounded">
          <div className="h-full w-full rounded bg-foreground" />
        </div>
      </div>

      {/* Card 2 - Facturé */}
      <div className="bg-card p-5">
        <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
          Facturé
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="num text-muted-foreground text-xl font-bold">
            {pctFacture}%
          </span>
          <span className="num text-2xl font-bold tracking-tight">
            {formatCurrency(facture)}
          </span>
        </div>
        <div className="text-muted-foreground mt-1 text-xs">
          {resteAFacturer > 0
            ? `${formatCurrency(resteAFacturer)} reste à facturer`
            : 'tout est facturé'}
        </div>
        <div className="bg-muted/40 mt-3 h-1 overflow-hidden rounded">
          <div
            className="h-full rounded bg-blue-500"
            style={{ width: `${Math.min(100, pctFacture)}%` }}
          />
        </div>
      </div>

      {/* Card 3 - Encaissé */}
      <div className="bg-card p-5">
        <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
          Encaissé
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="num text-muted-foreground text-xl font-bold">
            {pctEncaisse}%
          </span>
          <span className="num text-2xl font-bold tracking-tight">
            {formatCurrency(encaisse)}
          </span>
        </div>
        <div className="text-muted-foreground mt-1 text-xs">
          {enAttentePaiement > 0
            ? `${formatCurrency(enAttentePaiement)} en attente de paiement`
            : 'tout est encaissé'}
        </div>
        <div className="bg-muted/40 mt-3 h-1 overflow-hidden rounded">
          <div
            className="h-full rounded bg-green-500"
            style={{ width: `${Math.min(100, pctEncaisse)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
