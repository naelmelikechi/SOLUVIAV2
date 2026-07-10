'use client';

import { Fragment, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarClock, ChevronDown, ChevronRight } from 'lucide-react';

import { createBrouillonEcheancier } from '@/lib/actions/factures';
import type { EcheancierDueMois } from '@/lib/queries/echeancier-dues';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';
import { formatCurrency, formatMoisConcerne } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';

interface EcheancierTabProps {
  dues: EcheancierDueMois[];
  /** 1er du mois courant (yyyy-mm-01) : tout mois antérieur est en retard. */
  cutoffMois: string;
}

function rowKey(d: EcheancierDueMois): string {
  return `${d.projetId}::${d.moisConcerne}`;
}

export function EcheancierTab({ dues, cutoffMois }: EcheancierTabProps) {
  const { refresh } = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onPrepare = (due: EcheancierDueMois) => {
    const key = rowKey(due);
    setPendingKey(key);
    startTransition(async () => {
      const res = await createBrouillonEcheancier({
        projetId: due.projetId,
        mois: [due.moisConcerne],
      });
      setPendingKey(null);
      if (res.success) {
        toast.success(
          'Brouillon de facture préparé. À vérifier puis envoyer dans l’onglet À émettre.',
        );
        refresh();
      } else {
        toast.error(res.error ?? 'Erreur lors de la préparation du brouillon');
      }
    });
  };

  if (dues.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={CalendarClock}
          title="Échéancier à jour"
          description="Toutes les échéances dues des projets au modèle échéancier ont été facturées."
          hint="Une échéance devient due le mois de son jalon (1/12 par défaut). Elle apparaît ici tant qu'aucune facture ne la couvre."
        />
      </Card>
    );
  }

  const totalDu = dues.reduce((s, d) => s + d.montantHt, 0);

  return (
    <Card className="p-6">
      <div className="text-muted-foreground mb-4 text-sm">
        {'Total dû : '}
        <span className="text-foreground font-semibold tabular-nums">
          {formatCurrency(totalDu)}
        </span>{' '}
        HT sur {dues.length} échéance{dues.length > 1 ? 's' : ''}
      </div>
      <div className="border-border overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Projet</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Mois</TableHead>
              <TableHead className="text-right">Contrats</TableHead>
              <TableHead className="text-right">Montant HT</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {dues.map((due) => {
              const key = rowKey(due);
              const isExpanded = expanded.has(key);
              const enRetard = due.moisConcerne < cutoffMois;
              const rowPending = isPending && pendingKey === key;
              return (
                <Fragment key={key}>
                  <TableRow
                    className="hover:bg-muted/40 cursor-pointer"
                    onClick={() => toggleExpand(key)}
                  >
                    <TableCell>
                      {isExpanded ? (
                        <ChevronDown className="text-muted-foreground size-4" />
                      ) : (
                        <ChevronRight className="text-muted-foreground size-4" />
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{due.projetRef}</span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {due.clientRaisonSociale}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          {formatMoisConcerne(due.moisConcerne)}
                        </span>
                        {enRetard && (
                          <span className="inline-flex items-center rounded-full bg-[var(--warning)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--warning)]">
                            En retard
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {new Set(due.contributions.map((c) => c.contratId)).size}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono text-sm font-semibold tabular-nums">
                        {formatCurrency(due.montantHt)}
                      </span>
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() => onPrepare(due)}
                      >
                        {rowPending
                          ? 'Préparation...'
                          : 'Préparer le brouillon'}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={7} className="p-0">
                        <div className="px-10 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground text-left">
                                <th className="pb-1.5 font-medium">Contrat</th>
                                <th className="pb-1.5 font-medium">
                                  Apprenant
                                </th>
                                <th className="pb-1.5 font-medium">
                                  Formation
                                </th>
                                <th className="pb-1.5 text-right font-medium">
                                  Jalon
                                </th>
                                <th className="pb-1.5 text-right font-medium">
                                  HT
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {due.contributions.map((c, i) => (
                                <tr
                                  key={`${c.contratId}-${c.moisRelatif}`}
                                  className={cn(
                                    i > 0 && 'border-border/50 border-t',
                                  )}
                                >
                                  <td className="text-muted-foreground py-1 font-mono">
                                    {c.contractNumber ?? c.contratRef ?? '-'}
                                  </td>
                                  <td className="py-1">{c.apprenant || '-'}</td>
                                  <td className="text-muted-foreground max-w-[280px] truncate py-1">
                                    {c.formationTitre ?? '-'}
                                  </td>
                                  <td className="py-1 text-right tabular-nums">
                                    M+{c.moisRelatif}
                                  </td>
                                  <td className="py-1 text-right font-mono tabular-nums">
                                    {formatCurrency(c.montantHt)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <p className="text-muted-foreground mt-2 text-[10px]">
                            Commission {due.tauxCommission}%
                            {due.templateNom
                              ? ` - échéancier « ${due.templateNom} »`
                              : due.templateSource === 'override'
                                ? ' - échéancier spécifique au projet'
                                : ''}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
