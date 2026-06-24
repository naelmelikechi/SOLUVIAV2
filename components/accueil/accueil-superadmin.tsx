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

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn('text-2xl font-bold tabular-nums', accent)}>{value}</p>
    </Card>
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
            Supervision — contrats non facturés sur Eduvia
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Échus à traiter"
            value={String(echus)}
            accent="text-red-500"
          />
          <StatCard
            label="À venir"
            value={String(aVenir)}
            accent="text-blue-500"
          />
          <StatCard
            label="Montant non transmis"
            value={formatCurrency(montantTotal)}
          />
        </div>

        {worklist.length > 0 && <WorklistGrid items={worklist} />}

        <Card className="p-6">
          <h3 className="mb-4 text-sm font-semibold">
            {contrats.length} contrat{contrats.length > 1 ? 's' : ''} avec
            échéance OPCO non transmise
          </h3>
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
        </Card>
      </div>

      <ContratDetailSheet
        contratId={selectedContratId}
        onOpenChange={(open) => !open && setSelectedContratId(null)}
      />
    </TooltipProvider>
  );
}
