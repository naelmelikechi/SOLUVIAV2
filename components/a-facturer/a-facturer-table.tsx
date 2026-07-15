'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import type { ContratAFacturer } from '@/lib/queries/contrats-a-facturer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DataTable } from '@/components/shared/data-table';
import { ContratDetailSheet } from '@/components/projets/contrat-detail-sheet';
import { setContratsFacturables } from '@/lib/actions/contrats-facturables';
import { aFacturerColumns } from './a-facturer-columns';

export function AFacturerTable({ data }: { data: ContratAFacturer[] }) {
  const [selectedContratId, setSelectedContratId] = useState<string | null>(
    null,
  );
  const [pending, start] = useTransition();
  const router = useRouter();

  const marquerNonFacturables = (
    rows: ContratAFacturer[],
    reset: () => void,
  ) => {
    start(async () => {
      const res = await setContratsFacturables({
        contratIds: rows.map((r) => r.contratId),
        facturable: false,
      });
      if (res.success) {
        toast.success(
          `${rows.length} contrat${rows.length > 1 ? 's' : ''} marqué${rows.length > 1 ? 's' : ''} non facturable${rows.length > 1 ? 's' : ''} (réversible plus bas)`,
        );
        reset();
        router.refresh();
      } else {
        toast.error(res.error ?? 'Échec de la mise à jour');
      }
    });
  };

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
          enableRowSelection
          renderBulkActions={(rows, reset) => (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => marquerNonFacturables(rows, reset)}
            >
              <EyeOff className="mr-1.5 size-4" />
              Rendre non facturable{rows.length > 1 ? 's' : ''}
            </Button>
          )}
        />
      </Card>
      <ContratDetailSheet
        contratId={selectedContratId}
        onOpenChange={(open) => !open && setSelectedContratId(null)}
      />
    </TooltipProvider>
  );
}
