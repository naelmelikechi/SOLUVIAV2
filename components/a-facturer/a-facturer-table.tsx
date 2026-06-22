'use client';

import { useState } from 'react';
import type { ContratAFacturer } from '@/lib/queries/contrats-a-facturer';
import { Card } from '@/components/ui/card';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DataTable } from '@/components/shared/data-table';
import { ContratDetailSheet } from '@/components/projets/contrat-detail-sheet';
import { aFacturerColumns } from './a-facturer-columns';

export function AFacturerTable({ data }: { data: ContratAFacturer[] }) {
  const [selectedContratId, setSelectedContratId] = useState<string | null>(
    null,
  );

  if (data.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="text-muted-foreground text-sm">
          Aucun contrat à facturer. Tout est à jour 🎉
        </p>
      </Card>
    );
  }

  return (
    <TooltipProvider delay={200}>
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <h3 className="text-sm font-semibold">
            {data.length} contrat{data.length > 1 ? 's' : ''} à facturer
          </h3>
        </div>
        <DataTable
          columns={aFacturerColumns}
          data={data}
          searchPlaceholder="Rechercher (contrat, apprenti, projet, OPCO)..."
          paginationMode="auto"
          onRowClick={(c) => setSelectedContratId(c.contratId)}
          emptyMessage="Aucun résultat."
        />
      </Card>
      <ContratDetailSheet
        contratId={selectedContratId}
        onOpenChange={(open) => !open && setSelectedContratId(null)}
      />
    </TooltipProvider>
  );
}
