'use client';

import { Fragment, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarClock, ChevronDown, ChevronRight } from 'lucide-react';

import { createBrouillonEcheancier } from '@/lib/actions/factures';
import type { EcheancierDueMois } from '@/lib/queries/echeancier-dues';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

export interface EcheancierProjetOption {
  id: string;
  ref: string;
  client_raison_sociale: string;
}

interface EcheancierTabProps {
  /** Projets au modèle échéancier ayant au moins un contrat. */
  projets: EcheancierProjetOption[];
  /** Échéances dues, tous projets confondus (filtrées ici par le sélecteur). */
  dues: EcheancierDueMois[];
  /** Projection des échéances À VENIR (mois futurs, horizon glissant). */
  upcoming: EcheancierDueMois[];
  /** 1er du mois courant (yyyy-mm-01) : tout mois antérieur est en retard. */
  cutoffMois: string;
}

const NDASH = '-';

/** Détail contrat par contrat d'une échéance mois (dues ou à venir). */
function EcheanceContribDetail({ due }: { due: EcheancierDueMois }) {
  return (
    <div className="px-10 py-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground text-left">
            <th className="pb-1.5 font-medium">Contrat</th>
            <th className="pb-1.5 font-medium">Apprenant</th>
            <th className="pb-1.5 font-medium">Formation</th>
            <th className="pb-1.5 text-right font-medium">Jalon</th>
            <th className="pb-1.5 text-right font-medium">HT</th>
          </tr>
        </thead>
        <tbody>
          {due.contributions.map((c, i) => (
            <tr
              key={`${c.contratId}-${c.moisRelatif}`}
              className={cn(i > 0 && 'border-border/50 border-t')}
            >
              <td className="text-muted-foreground py-1 font-mono">
                {c.contractNumber ?? c.contratRef ?? NDASH}
              </td>
              <td className="py-1">{c.apprenant || NDASH}</td>
              <td className="text-muted-foreground max-w-[280px] truncate py-1">
                {c.formationTitre ?? NDASH}
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
  );
}

export function EcheancierTab({
  projets,
  dues,
  upcoming,
  cutoffMois,
}: EcheancierTabProps) {
  const { refresh } = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingMois, setPendingMois] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Un seul CFA/projet à la fois (pas de mélange) : défaut = le premier
  // projet qui a des échéances dues, sinon le premier de la liste.
  const [selectedProjetId, setSelectedProjetId] = useState<string>(
    () => dues[0]?.projetId ?? projets[0]?.id ?? '',
  );

  const projetDues = useMemo(
    () => dues.filter((d) => d.projetId === selectedProjetId),
    [dues, selectedProjetId],
  );

  const projetUpcoming = useMemo(
    () => upcoming.filter((d) => d.projetId === selectedProjetId),
    [upcoming, selectedProjetId],
  );

  const duesCountByProjet = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of dues) m.set(d.projetId, (m.get(d.projetId) ?? 0) + 1);
    return m;
  }, [dues]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onPrepare = (due: EcheancierDueMois) => {
    setPendingMois(due.moisConcerne);
    startTransition(async () => {
      const res = await createBrouillonEcheancier({
        projetId: due.projetId,
        mois: [due.moisConcerne],
      });
      setPendingMois(null);
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

  if (projets.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={CalendarClock}
          title="Aucun projet au modèle échéancier"
          description="Les projets facturés en jalons mensuels (1/12) apparaîtront ici."
        />
      </Card>
    );
  }

  const ttcOf = (d: { montantHt: number; tvaPct: number }) =>
    Math.round(d.montantHt * (1 + d.tvaPct / 100) * 100) / 100;
  const totalDu = projetDues.reduce((s, d) => s + d.montantHt, 0);
  const totalDuTtc = projetDues.reduce((s, d) => s + ttcOf(d), 0);
  const totalUpcoming = projetUpcoming.reduce((s, d) => s + d.montantHt, 0);
  const totalUpcomingTtc = projetUpcoming.reduce((s, d) => s + ttcOf(d), 0);
  const selectedProjet = projets.find((p) => p.id === selectedProjetId);

  return (
    <Card className="p-6">
      {/* Sélecteur projet : l'état affiché est TOUJOURS celui d'un seul projet */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Projet :</span>
          <Select
            value={selectedProjetId}
            onValueChange={(v) => setSelectedProjetId(v ?? '')}
          >
            <SelectTrigger className="min-w-[280px]">
              <SelectValue placeholder="Sélectionner un projet">
                {(value) => {
                  const p = projets.find((x) => x.id === value);
                  if (!p) return 'Sélectionner un projet';
                  return (
                    <>
                      <span className="font-mono text-xs">{p.ref}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        {NDASH} {p.client_raison_sociale}
                      </span>
                    </>
                  );
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {projets.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="font-mono text-xs">{p.ref}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    {NDASH} {p.client_raison_sociale}
                  </span>
                  {(duesCountByProjet.get(p.id) ?? 0) > 0 && (
                    <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--warning)] px-1 text-[10px] font-bold text-white">
                      {duesCountByProjet.get(p.id)}
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {projetDues.length > 0 && (
          <div className="text-muted-foreground text-sm">
            {'Total dû : '}
            <span className="text-foreground font-semibold tabular-nums">
              {formatCurrency(totalDu)}
            </span>{' '}
            HT ({formatCurrency(totalDuTtc)} TTC) {NDASH} commission{' '}
            {projetDues[0]!.tauxCommission}%
          </div>
        )}
      </div>

      {projetDues.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Échéancier à jour"
          description={
            selectedProjet
              ? `Toutes les échéances dues de ${selectedProjet.ref} ont été facturées (ou aucun jalon n'est encore arrivé à échéance).`
              : 'Sélectionnez un projet.'
          }
          hint="Une échéance devient due le mois de son jalon. Elle apparaît ici tant qu'aucune facture ne la couvre."
        />
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Mois</TableHead>
                <TableHead className="text-right">Contrats</TableHead>
                <TableHead className="text-right">Montant HT</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projetDues.map((due) => {
                const key = due.moisConcerne;
                const isExpanded = expanded.has(key);
                const enRetard = due.moisConcerne < cutoffMois;
                const rowPending = isPending && pendingMois === key;
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
                        {
                          new Set(due.contributions.map((c) => c.contratId))
                            .size
                        }
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex flex-col items-end font-mono text-sm font-semibold tabular-nums">
                          <span>{formatCurrency(due.montantHt)}</span>
                          <span className="text-muted-foreground text-[10px] leading-tight font-normal">
                            {formatCurrency(
                              Math.round(
                                due.montantHt * (1 + due.tvaPct / 100) * 100,
                              ) / 100,
                            )}{' '}
                            TTC
                          </span>
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
                        <TableCell colSpan={5} className="p-0">
                          <EcheanceContribDetail due={due} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Projection : ce qui arrive et quand (jalons futurs, non encore dus). */}
      {projetUpcoming.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-foreground text-sm font-semibold">
              À venir{' '}
              <span className="text-muted-foreground font-normal">
                · prochains 3 mois
              </span>
            </h3>
            <div className="text-muted-foreground text-sm">
              {'Prévisionnel : '}
              <span className="text-foreground font-semibold tabular-nums">
                {formatCurrency(totalUpcoming)}
              </span>{' '}
              HT ({formatCurrency(totalUpcomingTtc)} TTC)
            </div>
          </div>
          <div className="border-border overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Mois</TableHead>
                  <TableHead className="text-right">Contrats</TableHead>
                  <TableHead className="text-right">Montant HT prévu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projetUpcoming.map((due) => {
                  const key = due.moisConcerne;
                  const isExpanded = expanded.has(key);
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
                          <div className="flex items-center gap-2">
                            <span className="text-sm">
                              {formatMoisConcerne(due.moisConcerne)}
                            </span>
                            <span className="text-muted-foreground bg-muted inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium">
                              Prévu
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {
                            new Set(due.contributions.map((c) => c.contratId))
                              .size
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-muted-foreground inline-flex flex-col items-end font-mono text-sm font-semibold tabular-nums">
                            <span>{formatCurrency(due.montantHt)}</span>
                            <span className="text-[10px] leading-tight font-normal">
                              {formatCurrency(
                                Math.round(
                                  due.montantHt * (1 + due.tvaPct / 100) * 100,
                                ) / 100,
                              )}{' '}
                              TTC
                            </span>
                          </span>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={4} className="p-0">
                            <EcheanceContribDetail due={due} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-muted-foreground mt-2 text-[11px]">
            Projection des jalons à venir. La facturation se prépare depuis le
            tableau du haut le mois où l&apos;échéance devient due.
          </p>
        </div>
      )}
    </Card>
  );
}
