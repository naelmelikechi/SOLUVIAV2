'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  ContratDetailSections,
  ContratStateBadge,
} from '@/components/projets/contrat-detail-sections';
import { fetchContratDetail } from '@/lib/actions/contrats';
import type { ContratDetail } from '@/lib/queries/contrats';
import { logger } from '@/lib/utils/logger';
import { Loader2, ExternalLink } from 'lucide-react';

interface Props {
  contratId: string | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Coup d'oeil rapide sur un contrat depuis une table (doctrine disclosure :
 * sheet = read-mostly, sections clés). La fiche complète vit sur la page
 * /projets/[ref]/contrats/[id] via le lien "Ouvrir la fiche".
 */
export function ContratDetailSheet({ contratId, onOpenChange }: Props) {
  const [data, setData] = useState<ContratDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contratId) return;
    let cancelled = false;
    // Reset avant chaque fetch : synchronisation explicite avec la ressource.
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    fetchContratDetail(contratId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        logger.error('contrat-detail-sheet', err, { contratId });
        if (!cancelled) setError('Impossible de charger le contrat.');
      });
    return () => {
      cancelled = true;
    };
  }, [contratId]);

  const loading = contratId !== null && data?.contrat.id !== contratId;
  const projetRef = data?.contrat.projet?.ref;

  return (
    <Sheet open={contratId !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!max-w-2xl overflow-y-auto sm:!max-w-2xl"
      >
        {error ? (
          <div className="flex flex-1 items-center justify-center px-6 py-20">
            <p className="text-muted-foreground text-sm">{error}</p>
          </div>
        ) : loading || !data ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <Loader2 className="text-muted-foreground size-6 animate-spin" />
          </div>
        ) : (
          <>
            <SheetHeader className="border-b pb-4">
              <div className="flex items-center justify-between gap-2">
                <SheetTitle className="text-base">
                  {data.contrat.apprenant_prenom}{' '}
                  {data.contrat.apprenant_nom?.toUpperCase()}
                </SheetTitle>
                <ContratStateBadge state={data.contrat.contract_state} />
              </div>
              <div className="text-muted-foreground text-xs">
                {data.contrat.formation_titre ?? 'Formation non renseignée'}
              </div>
              {projetRef && data.contrat.id && (
                <Link
                  href={`/projets/${projetRef}/contrats/${data.contrat.id}`}
                  className="text-primary inline-flex w-fit items-center gap-1.5 text-xs font-medium underline-offset-2 hover:underline"
                >
                  <ExternalLink className="size-3.5" />
                  Ouvrir la fiche complète
                </Link>
              )}
            </SheetHeader>

            <div className="p-4">
              <ContratDetailSections data={data} compact />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
