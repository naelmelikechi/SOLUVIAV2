'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Check, FileText, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import {
  formatCurrency,
  formatDate,
  formatPercent,
} from '@/lib/utils/formatters';
import { resolveAjustement } from '@/lib/actions/echeanciers';
import type { AjustementPending } from '@/lib/queries/ajustements';

interface Props {
  ajustements: AjustementPending[];
}

export function AjustementsList({ ajustements }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);

  function ignore(id: string) {
    startTransition(async () => {
      const r = await resolveAjustement({ id, action: 'ignored' });
      if (r.success) {
        toast.success('Ajustement marqué comme ignoré');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  function markEmitted(id: string) {
    startTransition(async () => {
      const r = await resolveAjustement({ id, action: 'emitted' });
      if (r.success) {
        toast.success('Ajustement marqué comme émis');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  if (ajustements.length === 0) {
    return (
      <EmptyState
        icon={Check}
        title="Aucun ajustement en attente"
        description="Les ajustements sont créés automatiquement lors d'un changement de NPEC ou d'une rupture de contrat sur un contrat ayant déjà des factures émises."
      />
    );
  }

  return (
    <div className="space-y-3">
      {ajustements.map((aj) => {
        const isExpanded = expanded === aj.id;
        const detail = aj.detail as {
          breakdown?: Array<{
            facture_id: string;
            facture_ref: string;
            montant_emis?: number;
            montant_attendu?: number;
            delta_ligne?: number;
            montant_facture?: number;
            pct_realise?: number;
            montant_avoir?: number;
          }>;
          npec_actuel?: number;
          taux_commission?: number;
          date_rupture?: string;
          avoir_total_ht?: number;
        } | null;
        const apprenant = aj.contrat
          ? `${aj.contrat.apprenant_prenom ?? ''} ${aj.contrat.apprenant_nom ?? ''}`.trim() ||
            aj.contrat.contract_number ||
            'Contrat'
          : 'Contrat';
        const isPositive = aj.delta_ht > 0;
        return (
          <Card key={aj.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <AlertCircle
                    className={
                      isPositive
                        ? 'h-4 w-4 text-[var(--warning)]'
                        : 'h-4 w-4 text-[var(--destructive)]'
                    }
                  />
                  <span className="text-sm font-semibold">{apprenant}</span>
                  <StatusBadge
                    label={
                      aj.type === 'npec_change' ? 'Changement NPEC' : 'Rupture'
                    }
                    color={aj.type === 'npec_change' ? 'orange' : 'red'}
                  />
                  {aj.projet?.ref && (
                    <Link
                      href={`/projets/${aj.projet.ref}`}
                      className="text-muted-foreground hover:text-foreground text-xs underline"
                    >
                      {aj.projet.ref}
                    </Link>
                  )}
                </div>
                {aj.motif && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {aj.motif}
                  </p>
                )}
                <p className="text-muted-foreground mt-1 text-xs">
                  Détecté le {formatDate(aj.created_at)}
                </p>
              </div>
              <div className="text-right">
                <div
                  className={
                    isPositive
                      ? 'text-base font-bold text-[var(--warning)] tabular-nums'
                      : 'text-base font-bold text-[var(--destructive)] tabular-nums'
                  }
                >
                  {isPositive ? '+' : ''}
                  {formatCurrency(aj.delta_ht)}
                </div>
                <div className="text-muted-foreground text-[10px]">
                  {isPositive ? 'à émettre' : 'avoir'}
                </div>
              </div>
            </div>

            {detail?.breakdown && detail.breakdown.length > 0 && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : aj.id)}
                  className="text-muted-foreground hover:text-foreground text-xs underline"
                >
                  {isExpanded ? 'Masquer' : 'Voir'} le détail (
                  {detail.breakdown.length} facture
                  {detail.breakdown.length > 1 ? 's' : ''})
                </button>
                {isExpanded && (
                  <div className="border-border mt-2 space-y-1 rounded border p-2 text-xs">
                    {detail.breakdown.map((b) => (
                      <div
                        key={b.facture_id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="font-mono">{b.facture_ref}</span>
                        {aj.type === 'npec_change' ? (
                          <span className="text-muted-foreground tabular-nums">
                            émis {formatCurrency(b.montant_emis ?? 0)} / attendu{' '}
                            {formatCurrency(b.montant_attendu ?? 0)} ={' '}
                            <span
                              className={
                                (b.delta_ligne ?? 0) > 0
                                  ? 'font-semibold text-[var(--warning)]'
                                  : 'font-semibold text-[var(--destructive)]'
                              }
                            >
                              {(b.delta_ligne ?? 0) > 0 ? '+' : ''}
                              {formatCurrency(b.delta_ligne ?? 0)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground tabular-nums">
                            facture {formatCurrency(b.montant_facture ?? 0)} ·
                            réalisé {formatPercent((b.pct_realise ?? 0) * 100)}{' '}
                            · avoir{' '}
                            <span className="font-semibold text-[var(--destructive)]">
                              {formatCurrency(b.montant_avoir ?? 0)}
                            </span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              {detail?.breakdown?.[0]?.facture_ref && (
                <Link
                  href={`/facturation/${detail.breakdown[0].facture_ref}`}
                  className="border-border hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Voir la facture origine
                </Link>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => ignore(aj.id)}
                disabled={pending}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Ignorer
              </Button>
              <Button
                size="sm"
                onClick={() => markEmitted(aj.id)}
                disabled={pending}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Marquer comme émis
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
