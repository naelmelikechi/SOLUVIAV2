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
import {
  resolveAjustement,
  listCandidateFacturesForAjustement,
} from '@/lib/actions/echeanciers';
import type {
  AjustementPending,
  CandidateFacture,
} from '@/lib/queries/ajustements';

interface Props {
  ajustements: AjustementPending[];
}

export function AjustementsList({ ajustements }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateFacture[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

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

  async function openPicker(id: string) {
    setPickerFor(id);
    setCandidates([]);
    setLoadingCandidates(true);
    try {
      const list = await listCandidateFacturesForAjustement(id);
      setCandidates(list);
    } finally {
      setLoadingCandidates(false);
    }
  }

  function markEmittedWithFacture(id: string, factureId: string) {
    startTransition(async () => {
      const r = await resolveAjustement({
        id,
        action: 'emitted',
        factureId,
      });
      if (r.success) {
        toast.success('Ajustement lié à la facture');
        setPickerFor(null);
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
            // npec_change : groupe par jalon
            mois_relatif?: number;
            quote_part?: number;
            taux_commission_snapshot?: number;
            montant_emis?: number;
            montant_attendu?: number;
            delta_jalon?: number;
            lignes?: Array<{
              facture_id: string;
              facture_ref: string;
              montant_ht: number;
            }>;
            // rupture : encore par facture
            facture_id?: string;
            facture_ref?: string;
            montant_facture?: number;
            pct_realise?: number;
            montant_avoir?: number;
          }>;
          npec_actuel?: number;
          taux_commission?: number;
          delta_ht_brut?: number;
          credits_existing?: number;
          date_rupture?: string;
          avoir_total_ht?: number;
          avoir_total_ht_net?: number;
          previous_resolved?: {
            id: string;
            delta_ht: number;
            resolved_action: 'emitted' | 'ignored';
            resolved_facture_id: string | null;
            resolved_at: string;
          } | null;
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
                {detail?.credits_existing != null &&
                  detail.credits_existing !== 0 && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Net = brut {formatCurrency(detail.delta_ht_brut ?? 0)} -
                      avoirs déjà émis {formatCurrency(detail.credits_existing)}{' '}
                      ={' '}
                      <span className="font-semibold">
                        {formatCurrency(aj.delta_ht)}
                      </span>
                    </p>
                  )}
                <p className="text-muted-foreground mt-1 text-xs">
                  Détecté le {formatDate(aj.created_at)}
                </p>
                {detail?.previous_resolved && (
                  <p className="text-muted-foreground mt-1 text-xs italic">
                    Précédent ajustement{' '}
                    {detail.previous_resolved.resolved_action === 'emitted'
                      ? 'émis'
                      : 'ignoré'}{' '}
                    le {formatDate(detail.previous_resolved.resolved_at)} (
                    {formatCurrency(detail.previous_resolved.delta_ht)})
                  </p>
                )}
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
                  {detail.breakdown.length}{' '}
                  {aj.type === 'npec_change' ? 'jalon' : 'facture'}
                  {detail.breakdown.length > 1 ? 's' : ''})
                </button>
                {isExpanded && (
                  <div className="border-border mt-2 space-y-2 rounded border p-2 text-xs">
                    {detail.breakdown.map((b, idx) => {
                      if (aj.type === 'npec_change') {
                        // Legacy : pas de mois_relatif, on a delta_ligne par
                        // facture (ancien format pre-fix #1). On l'affiche
                        // tel quel pour ne pas casser l'UI sur les pending
                        // historiques.
                        const isLegacy =
                          b.mois_relatif == null && b.facture_ref != null;
                        if (isLegacy) {
                          const legacyDelta =
                            (b as { delta_ligne?: number }).delta_ligne ?? 0;
                          return (
                            <div
                              key={b.facture_id ?? `legacy-${idx}`}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="font-mono">{b.facture_ref}</span>
                              <span className="text-muted-foreground tabular-nums">
                                émis {formatCurrency(b.montant_emis ?? 0)} /
                                attendu {formatCurrency(b.montant_attendu ?? 0)}{' '}
                                ={' '}
                                <span
                                  className={
                                    legacyDelta > 0
                                      ? 'font-semibold text-[var(--warning)]'
                                      : 'font-semibold text-[var(--destructive)]'
                                  }
                                >
                                  {legacyDelta > 0 ? '+' : ''}
                                  {formatCurrency(legacyDelta)}
                                </span>
                              </span>
                            </div>
                          );
                        }
                        const moisLabel = `M+${b.mois_relatif ?? '?'}`;
                        return (
                          <div
                            key={`jalon-${b.mois_relatif}-${idx}`}
                            className="space-y-0.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono">{moisLabel}</span>
                              <span className="text-muted-foreground tabular-nums">
                                émis {formatCurrency(b.montant_emis ?? 0)} /
                                attendu {formatCurrency(b.montant_attendu ?? 0)}{' '}
                                ={' '}
                                <span
                                  className={
                                    (b.delta_jalon ?? 0) > 0
                                      ? 'font-semibold text-[var(--warning)]'
                                      : 'font-semibold text-[var(--destructive)]'
                                  }
                                >
                                  {(b.delta_jalon ?? 0) > 0 ? '+' : ''}
                                  {formatCurrency(b.delta_jalon ?? 0)}
                                </span>
                              </span>
                            </div>
                            {b.lignes && b.lignes.length > 1 && (
                              <div className="text-muted-foreground pl-3 text-[10px]">
                                {b.lignes
                                  .map(
                                    (l) =>
                                      `${l.facture_ref} (${formatCurrency(l.montant_ht)})`,
                                  )
                                  .join(' + ')}
                              </div>
                            )}
                          </div>
                        );
                      }
                      return (
                        <div
                          key={b.facture_id ?? `f-${idx}`}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="font-mono">{b.facture_ref}</span>
                          <span className="text-muted-foreground tabular-nums">
                            facture {formatCurrency(b.montant_facture ?? 0)} ·
                            réalisé {formatPercent((b.pct_realise ?? 0) * 100)}{' '}
                            · avoir{' '}
                            <span className="font-semibold text-[var(--destructive)]">
                              {formatCurrency(b.montant_avoir ?? 0)}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              {(() => {
                const firstRef =
                  detail?.breakdown?.[0]?.facture_ref ??
                  detail?.breakdown?.[0]?.lignes?.[0]?.facture_ref;
                if (!firstRef) return null;
                return (
                  <Link
                    href={`/facturation/${firstRef}`}
                    className="border-border hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Voir la facture origine
                  </Link>
                );
              })()}
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
                onClick={() => openPicker(aj.id)}
                disabled={pending}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Lier à une facture
              </Button>
            </div>

            {pickerFor === aj.id && (
              <div className="border-border mt-3 rounded border p-3 text-xs">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold">
                    Facture qui matérialise cet ajustement :
                  </span>
                  <button
                    type="button"
                    onClick={() => setPickerFor(null)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                {loadingCandidates ? (
                  <p className="text-muted-foreground">Chargement…</p>
                ) : candidates.length === 0 ? (
                  <p className="text-muted-foreground">
                    Aucune facture candidate trouvée (
                    {aj.delta_ht < 0 ? 'avoir' : 'facture standard'} sur ce
                    contrat, émise après {formatDate(aj.created_at)}). Émets la
                    facture/avoir correspondant puis reviens ici.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {candidates.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="font-mono">
                          {c.ref ?? '(brouillon)'} ·{' '}
                          {formatCurrency(c.montant_ht)} ·{' '}
                          {c.date_emission ? formatDate(c.date_emission) : '-'}{' '}
                          · {c.statut}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markEmittedWithFacture(aj.id, c.id)}
                          disabled={pending}
                        >
                          Lier
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
