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
  periodeLabel?: string;
}

export function TrinityFunnel({
  production,
  facture,
  encaisse,
  productionTrend,
  editMode,
  onHide,
  periodeLabel,
}: TrinityFunnelProps) {
  const resteAFacturer = Math.max(0, production - facture);
  const enAttentePaiement = Math.max(0, facture - encaisse);
  const tauxRecouvrement =
    facture > 0 ? Math.round((encaisse / facture) * 100) : 0;
  const trendUp = productionTrend > 0;

  return (
    <div>
      {periodeLabel && (
        <div className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wider uppercase">
          Période : {periodeLabel}
        </div>
      )}
      <div className="border-border/60 bg-border/60 relative grid grid-cols-1 gap-px overflow-hidden rounded-xl border md:grid-cols-3">
        {editMode && (
          <button
            type="button"
            onClick={() => onHide?.()}
            aria-label="Masquer le funnel"
            className="bg-background border-border hover:bg-destructive hover:text-destructive-foreground absolute top-2 right-2 z-10 inline-flex size-6 items-center justify-center rounded-full border text-xs"
          >
            ×
          </button>
        )}

        {/* Card 1 - Production */}
        <div className="from-card to-muted/30 bg-gradient-to-b p-5">
          <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
            Production HT
          </div>
          <div className="num mt-2 text-3xl font-bold tracking-tight">
            {formatCurrency(production)}
          </div>
          <div
            className={cn(
              'mt-1 flex h-4 items-center gap-1 text-xs font-semibold',
              productionTrend === 0
                ? 'text-muted-foreground'
                : trendUp
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400',
            )}
          >
            {productionTrend !== 0 &&
              (trendUp ? (
                <ArrowUpRight className="size-3" />
              ) : (
                <ArrowDownRight className="size-3" />
              ))}
            <span className="num">
              {productionTrend === 0
                ? 'stable vs M-1'
                : `vs M-1 : ${trendUp ? '+' : ''}${productionTrend}%`}
            </span>
          </div>
        </div>

        {/* Card 2 - Facturé */}
        <div className="bg-card p-5">
          <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
            Facturé HT
          </div>
          <div className="num mt-2 text-3xl font-bold tracking-tight">
            {formatCurrency(facture)}
          </div>
          <div className="text-muted-foreground mt-1 h-4 text-xs">
            {resteAFacturer > 0
              ? `${formatCurrency(resteAFacturer)} reste à facturer`
              : 'tout est facturé'}
          </div>
        </div>

        {/* Card 3 - Encaissé */}
        <div className="bg-card p-5">
          <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
            Encaissé HT
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="num text-3xl font-bold tracking-tight">
              {formatCurrency(encaisse)}
            </span>
            {facture > 0 && (
              <span className="num text-muted-foreground text-xs font-semibold">
                {tauxRecouvrement}% recouvré
              </span>
            )}
          </div>
          <div className="text-muted-foreground mt-1 h-4 text-xs">
            {enAttentePaiement > 0
              ? `${formatCurrency(enAttentePaiement)} en attente de paiement`
              : facture > 0
                ? 'tout est encaissé'
                : ''}
          </div>
        </div>
      </div>
    </div>
  );
}
