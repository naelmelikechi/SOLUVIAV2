'use client';

// components/dashboard/dashboard-alerts.tsx
// Section alertes : bande d'alertes, funnel trinity, chips contextuels, toolbar personnalisation.

import { cn } from '@/lib/utils';
import { AlertsStrip, type Alert } from '@/components/dashboard/alerts-strip';
import { TrinityFunnel } from '@/components/dashboard/trinity-funnel';
import { ContextChips } from '@/components/dashboard/context-chips';

interface DashboardAlertsProps {
  alerts: Alert[];
  totalProduction: number;
  totalFacture: number;
  totalEncaisse: number;
  productionTrend: number;
  totalEnRetard: number;
  totalAFacturer: number;
  weekHours: number;
  periodeLabel?: string;
  editMode: boolean;
  hiddenKeys: Set<string>;
  onHide: (key: string) => void;
  onToggleEditMode: () => void;
  onRestoreAll: () => void;
  isHidden: (key: string) => boolean;
}

export function DashboardAlerts({
  alerts,
  totalProduction,
  totalFacture,
  totalEncaisse,
  productionTrend,
  totalEnRetard,
  totalAFacturer,
  weekHours,
  periodeLabel,
  editMode,
  hiddenKeys,
  onHide,
  onToggleEditMode,
  onRestoreAll,
  isHidden,
}: DashboardAlertsProps) {
  return (
    <>
      {/* ========== Alerts ========== */}
      {!isHidden('alerts') && (
        <AlertsStrip
          alerts={alerts}
          editMode={editMode}
          onHide={() => onHide('alerts')}
        />
      )}

      {/* ========== Trinity Funnel ========== */}
      {!isHidden('trinity') && (
        <TrinityFunnel
          production={totalProduction}
          facture={totalFacture}
          encaisse={totalEncaisse}
          productionTrend={productionTrend}
          editMode={editMode}
          onHide={() => onHide('trinity')}
          periodeLabel={periodeLabel}
        />
      )}

      {/* ========== Context Chips ========== */}
      {!isHidden('chips') && (
        <ContextChips
          enRetard={totalEnRetard}
          aFacturer={totalAFacturer}
          weekHours={weekHours}
          editMode={editMode}
          onHide={() => onHide('chips')}
        />
      )}

      {/* ========== Personnalisation toolbar ========== */}
      <div className="flex items-center justify-end gap-2 text-xs">
        {hiddenKeys.size > 0 && (
          <span className="text-muted-foreground">
            {hiddenKeys.size} bloc(s) masqué(s) ·{' '}
            <button
              type="button"
              onClick={onRestoreAll}
              className="text-primary hover:underline"
            >
              Restaurer
            </button>
          </span>
        )}
        <button
          type="button"
          onClick={onToggleEditMode}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 transition-colors',
            editMode
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border hover:bg-accent',
          )}
        >
          {editMode ? 'Terminer' : 'Personnaliser'}
        </button>
      </div>
    </>
  );
}
