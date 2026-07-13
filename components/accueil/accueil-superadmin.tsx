'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DataTable } from '@/components/shared/data-table';
import { ContratDetailSheet } from '@/components/projets/contrat-detail-sheet';
import { formatCurrency } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import type { ContratNonFacture } from '@/lib/queries/contrats-a-facturer';
import { supervisionColumns } from './accueil-supervision-columns';
import { WorklistGrid } from './worklist-grid';
import type { AccueilWorklistItem } from '@/lib/queries/accueil';

// Cellule du bandeau de synthèse, rattachée visuellement à la table qu'elle
// résume (une seule Card : stats en tête, détail en dessous).
function StatCell({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="px-4 py-3 sm:px-5">
      <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 text-2xl leading-tight font-semibold tabular-nums',
          accent,
        )}
      >
        {value}
      </p>
      {hint && <p className="text-muted-foreground text-[11px]">{hint}</p>}
    </div>
  );
}

export function AccueilSuperadmin({
  prenom,
  contrats,
  worklist,
}: {
  prenom: string;
  contrats: ContratNonFacture[];
  worklist: AccueilWorklistItem[];
}) {
  const [selectedContratId, setSelectedContratId] = useState<string | null>(
    null,
  );

  const echus = contrats.filter((c) => c.statut === 'echu').length;
  const aVenir = contrats.length - echus;
  const montantTotal = contrats.reduce((s, c) => s + c.montantNonTransmis, 0);

  return (
    <TooltipProvider delay={200}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Bonjour {prenom || ''} 👋</h1>
          <p className="text-muted-foreground text-sm">
            {worklist.length > 0
              ? 'Vos actions du jour, puis la supervision Eduvia.'
              : 'Supervision - contrats non facturés sur Eduvia'}
          </p>
        </div>

        {worklist.length > 0 && <WorklistGrid items={worklist} />}

        {/* Supervision : le bandeau de stats et la table qu'il résume vivent
            dans la même Card - une seule unité de lecture. */}
        <Card className="gap-0 overflow-hidden p-0">
          <div className="border-border flex items-baseline justify-between border-b px-4 py-2.5 sm:px-5">
            <h2 className="text-sm font-semibold">
              Contrats non facturés sur Eduvia
            </h2>
            <span className="text-muted-foreground text-xs tabular-nums">
              {contrats.length} contrat{contrats.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="divide-border border-border grid grid-cols-3 divide-x border-b">
            <StatCell
              label="Échus à traiter"
              value={String(echus)}
              hint="échéance dépassée"
              accent={echus > 0 ? 'text-red-600 dark:text-red-400' : undefined}
            />
            <StatCell
              label="À venir"
              value={String(aVenir)}
              hint="dans les temps"
            />
            <StatCell
              label="Montant non transmis"
              value={formatCurrency(montantTotal)}
              hint="total OPCO en attente"
            />
          </div>
          <div className="px-4 py-4 sm:px-5">
            {contrats.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Aucun contrat non facturé. Tout est transmis 🎉
              </p>
            ) : (
              <DataTable
                columns={supervisionColumns}
                data={contrats}
                searchPlaceholder="Rechercher (contrat, apprenti, CDP, projet, OPCO)..."
                paginationMode="auto"
                onRowClick={(c) => setSelectedContratId(c.contratId)}
                emptyMessage="Aucun résultat."
              />
            )}
          </div>
        </Card>
      </div>

      <ContratDetailSheet
        contratId={selectedContratId}
        onOpenChange={(open) => !open && setSelectedContratId(null)}
      />
    </TooltipProvider>
  );
}
