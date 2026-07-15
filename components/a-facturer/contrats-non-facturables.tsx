'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import type { ContratAFacturer } from '@/lib/queries/contrats-a-facturer';
import { setContratsFacturables } from '@/lib/actions/contrats-facturables';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils/formatters';

/**
 * Zone de réversibilité : les contrats marqués non facturables (sortis de la
 * liste, du badge et de la worklist) restent visibles ici, repliés, avec un
 * bouton pour les rendre à nouveau facturables.
 */
export function ContratsNonFacturables({
  contrats,
}: {
  contrats: ContratAFacturer[];
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  if (contrats.length === 0) return null;

  const rendreFacturable = (contratId: string) => {
    start(async () => {
      const res = await setContratsFacturables({
        contratIds: [contratId],
        facturable: true,
      });
      if (res.success) {
        toast.success('Contrat de nouveau facturable');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Échec de la mise à jour');
      }
    });
  };

  return (
    <details className="border-border bg-card rounded-xl border">
      <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium transition-colors">
        <EyeOff className="size-4" />
        {contrats.length} contrat{contrats.length > 1 ? 's' : ''} marqué
        {contrats.length > 1 ? 's' : ''} non facturable
        {contrats.length > 1 ? 's' : ''}
        <span className="text-muted-foreground/70 text-xs font-normal">
          - exclus de la liste et des compteurs, réversible
        </span>
      </summary>
      <ul className="divide-border border-border divide-y border-t">
        {contrats.map((c) => (
          <li key={c.contratId} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {c.apprenti || c.contractNumber || c.ref}
              </p>
              <p className="text-muted-foreground text-xs">
                {[
                  c.projetRef,
                  c.opco,
                  c.montant != null ? formatCurrency(c.montant) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => rendreFacturable(c.contratId)}
            >
              <Eye className="mr-1.5 size-4" />
              Rendre facturable
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
