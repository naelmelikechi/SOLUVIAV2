'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  createBlankBrouillon,
  type BlankBrouillonLigne,
} from '@/lib/actions/factures';
import { fetchProjetContrats } from '@/lib/actions/facture-lignes-helpers';
import type {
  listProjetsForFacturation,
  ProjetForFacturation,
} from '@/lib/queries/factures';
import { formatCurrency } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';

interface NewFactureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProjets: Awaited<ReturnType<typeof listProjetsForFacturation>>;
}

interface LigneState {
  contratId: string;
  selected: boolean;
  // Tracks if user manually edited mois (so we don't overwrite on global change)
  moisRelatif: number;
  moisEdited: boolean;
  description: string;
  descriptionEdited: boolean;
  montantHt: number;
  montantEdited: boolean;
}

function buildDescription(params: {
  taux: number;
  formationTitre: string | null;
  prenom: string | null;
  nom: string | null;
  mois: number;
}): string {
  const { taux, formationTitre, prenom, nom, mois } = params;
  const formation = formationTitre ?? '';
  const apprenant = [prenom, nom].filter(Boolean).join(' ');
  return `Commission ${taux}% - ${formation} - ${apprenant} - mois M+${mois}`;
}

function computeMontantHt(params: {
  npec: number;
  taux: number;
  duree: number;
  mois: number;
}): number {
  const { npec, taux, duree, mois } = params;
  if (!Number.isFinite(npec) || npec <= 0) return 0;
  if (!Number.isFinite(taux) || taux <= 0) return 0;
  const safeDuree = duree > 0 ? duree : 12;
  const ratio = taux / 100;
  const monthly = (npec * ratio) / safeDuree;
  const raw = monthly * Math.max(0, mois);
  const cap = npec * ratio;
  return Math.round(Math.min(raw, cap) * 100) / 100;
}

export function NewFactureDialog({
  open,
  onOpenChange,
  initialProjets,
}: NewFactureDialogProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [search, setSearch] = useState('');
  const [projetId, setProjetId] = useState<string | null>(null);
  const [projetData, setProjetData] = useState<ProjetForFacturation | null>(
    null,
  );
  const [isLoadingContrats, startLoadingContrats] = useTransition();
  const [isSubmitting, startSubmitting] = useTransition();
  const [moisGlobal, setMoisGlobal] = useState<number>(1);
  const [lignes, setLignes] = useState<LigneState[]>([]);
  const firstDescRef = useRef<HTMLInputElement | null>(null);

  const filteredProjets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialProjets;
    return initialProjets.filter(
      (p) =>
        p.ref.toLowerCase().includes(q) ||
        p.client_raison_sociale.toLowerCase().includes(q),
    );
  }, [initialProjets, search]);

  // Reset state on close (via wrapper handler)
  function handleOpenChange(next: boolean) {
    if (!next) {
      setStep(1);
      setSearch('');
      setProjetId(null);
      setProjetData(null);
      setMoisGlobal(1);
      setLignes([]);
    }
    onOpenChange(next);
  }

  function handleNext() {
    if (!projetId) return;
    startLoadingContrats(async () => {
      const data = await fetchProjetContrats(projetId);
      if (!data) {
        toast.error('Impossible de charger les contrats du projet.');
        return;
      }
      setProjetData(data);
      const taux = data.tauxCommission;
      const initial: LigneState[] = data.contrats.map((c) => ({
        contratId: c.id,
        selected: false,
        moisRelatif: 1,
        moisEdited: false,
        description: buildDescription({
          taux,
          formationTitre: c.formation_titre,
          prenom: c.apprenant_prenom,
          nom: c.apprenant_nom,
          mois: 1,
        }),
        descriptionEdited: false,
        montantHt: computeMontantHt({
          npec: Number(c.npec_amount ?? 0),
          taux,
          duree: Number(c.duree_mois ?? 12),
          mois: 1,
        }),
        montantEdited: false,
      }));
      setLignes(initial);
      setMoisGlobal(1);
      setStep(2);
    });
  }

  function recomputeLigne(
    base: LigneState,
    contrat: ProjetForFacturation['contrats'][number],
    taux: number,
    overrides?: Partial<LigneState>,
  ): LigneState {
    const next: LigneState = { ...base, ...overrides };
    const moisToUse = next.moisRelatif;
    if (!next.descriptionEdited) {
      next.description = buildDescription({
        taux,
        formationTitre: contrat.formation_titre,
        prenom: contrat.apprenant_prenom,
        nom: contrat.apprenant_nom,
        mois: moisToUse,
      });
    }
    if (!next.montantEdited) {
      next.montantHt = computeMontantHt({
        npec: Number(contrat.npec_amount ?? 0),
        taux,
        duree: Number(contrat.duree_mois ?? 12),
        mois: moisToUse,
      });
    }
    return next;
  }

  function setLigneAt(idx: number, mutator: (l: LigneState) => LigneState) {
    setLignes((prev) => prev.map((l, i) => (i === idx ? mutator(l) : l)));
  }

  function handleToggleAll(checked: boolean) {
    if (!projetData) return;
    const taux = projetData.tauxCommission;
    setLignes((prev) =>
      prev.map((l, i) => {
        const contrat = projetData.contrats[i];
        if (!contrat) return l;
        if (checked) {
          // Lors du select-all : applique le mois global a toutes les lignes
          // qui n'ont pas ete editees manuellement.
          const moisToApply = l.moisEdited ? l.moisRelatif : moisGlobal;
          const next: LigneState = {
            ...l,
            selected: true,
            moisRelatif: moisToApply,
          };
          if (!next.descriptionEdited) {
            next.description = buildDescription({
              taux,
              formationTitre: contrat.formation_titre,
              prenom: contrat.apprenant_prenom,
              nom: contrat.apprenant_nom,
              mois: moisToApply,
            });
          }
          if (!next.montantEdited) {
            next.montantHt = computeMontantHt({
              npec: Number(contrat.npec_amount ?? 0),
              taux,
              duree: Number(contrat.duree_mois ?? 12),
              mois: moisToApply,
            });
          }
          return next;
        }
        return { ...l, selected: false };
      }),
    );
  }

  function handleToggleOne(idx: number, checked: boolean) {
    if (!projetData) return;
    const contrat = projetData.contrats[idx];
    if (!contrat) return;
    const taux = projetData.tauxCommission;
    setLigneAt(idx, (l) => {
      if (checked) {
        const moisToApply = l.moisEdited ? l.moisRelatif : moisGlobal;
        return recomputeLigne(l, contrat, taux, {
          selected: true,
          moisRelatif: moisToApply,
        });
      }
      return { ...l, selected: false };
    });
  }

  function handleMoisGlobalChange(value: number) {
    setMoisGlobal(value);
    if (!projetData) return;
    const taux = projetData.tauxCommission;
    setLignes((prev) =>
      prev.map((l, i) => {
        if (l.moisEdited) return l;
        const contrat = projetData.contrats[i];
        if (!contrat) return l;
        const next: LigneState = { ...l, moisRelatif: value };
        if (!next.descriptionEdited) {
          next.description = buildDescription({
            taux,
            formationTitre: contrat.formation_titre,
            prenom: contrat.apprenant_prenom,
            nom: contrat.apprenant_nom,
            mois: value,
          });
        }
        if (!next.montantEdited) {
          next.montantHt = computeMontantHt({
            npec: Number(contrat.npec_amount ?? 0),
            taux,
            duree: Number(contrat.duree_mois ?? 12),
            mois: value,
          });
        }
        return next;
      }),
    );
  }

  function handleMoisLigneChange(idx: number, value: number) {
    if (!projetData) return;
    const contrat = projetData.contrats[idx];
    if (!contrat) return;
    const taux = projetData.tauxCommission;
    setLigneAt(idx, (l) =>
      recomputeLigne(l, contrat, taux, {
        moisRelatif: value,
        moisEdited: true,
      }),
    );
  }

  function handleDescriptionChange(idx: number, value: string) {
    setLigneAt(idx, (l) => ({
      ...l,
      description: value,
      descriptionEdited: true,
    }));
  }

  function handleMontantChange(idx: number, value: number) {
    setLigneAt(idx, (l) => ({
      ...l,
      montantHt: value,
      montantEdited: true,
    }));
  }

  // Auto-focus first selected line description after entering step 2
  useEffect(() => {
    if (step === 2 && firstDescRef.current) {
      firstDescRef.current.focus();
    }
  }, [step]);

  const selectedLignes = useMemo(
    () => lignes.filter((l) => l.selected),
    [lignes],
  );
  const totalHt = useMemo(
    () =>
      Math.round(
        selectedLignes.reduce((s, l) => s + (l.montantHt || 0), 0) * 100,
      ) / 100,
    [selectedLignes],
  );
  const allSelected = lignes.length > 0 && lignes.every((l) => l.selected);
  const someSelected = lignes.some((l) => l.selected);

  const canSubmit =
    selectedLignes.length > 0 &&
    selectedLignes.every(
      (l) => Number.isFinite(l.montantHt) && l.montantHt > 0,
    );

  function handleSubmit() {
    if (!projetId || !projetData || !canSubmit) return;
    const taux = projetData.tauxCommission;
    const payload: BlankBrouillonLigne[] = selectedLignes.map((l) => {
      const contrat = projetData.contrats.find((c) => c.id === l.contratId);
      return {
        contratId: l.contratId,
        description: l.description.trim(),
        montantHt: l.montantHt,
        moisRelatif: l.moisRelatif,
        npecSnapshot: Number(contrat?.npec_amount ?? 0),
        tauxCommissionSnapshot: taux,
      };
    });

    startSubmitting(async () => {
      const result = await createBlankBrouillon({ projetId, lignes: payload });
      if (result.success) {
        toast.success('Brouillon préparé.');
        handleOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error ?? 'Erreur lors de la création du brouillon');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          'flex max-h-[90vh] flex-col gap-4',
          step === 1 ? 'sm:max-w-md' : 'sm:max-w-5xl',
        )}
      >
        <DialogHeader>
          <DialogTitle>
            {step === 1
              ? 'Nouvelle facture - choisir le projet'
              : 'Nouvelle facture - choisir les contrats'}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="search-projet">{'Projet'}</Label>
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 h-4 w-4" />
                <Input
                  id="search-projet"
                  placeholder={'Rechercher par réf. ou client...'}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-md border">
              {filteredProjets.length === 0 ? (
                <p className="text-muted-foreground p-4 text-center text-xs">
                  {'Aucun projet trouvé.'}
                </p>
              ) : (
                <ul className="divide-y">
                  {filteredProjets.map((p) => {
                    const active = p.id === projetId;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setProjetId(p.id)}
                          className={cn(
                            'hover:bg-accent flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors',
                            active && 'bg-accent',
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-mono text-xs font-semibold">
                              {p.ref}
                            </span>
                            <span className="text-muted-foreground ml-2 truncate">
                              {p.client_raison_sociale}
                            </span>
                          </div>
                          <span
                            className={cn(
                              'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                              p.billing_mode === 'auto'
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {p.billing_mode === 'auto' ? 'Auto' : 'Manuel'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {step === 2 && projetData && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="bg-muted/40 rounded-md border p-3 text-xs">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-sm font-semibold">
                  {projetData.projetRef}
                </span>
                <span className="text-muted-foreground">
                  {projetData.clientRaisonSociale}
                </span>
                <span className="text-muted-foreground">
                  {'- Commission '}
                  {projetData.tauxCommission}
                  {'%'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Label htmlFor="mois-global" className="text-xs">
                {'Mois relatif global'}
              </Label>
              <Input
                id="mois-global"
                type="number"
                min={0}
                step={1}
                value={moisGlobal}
                onChange={(e) =>
                  handleMoisGlobalChange(Number(e.target.value) || 0)
                }
                className="h-8 w-24"
              />
              <span className="text-muted-foreground text-[11px]">
                {'s’applique aux lignes non éditées individuellement'}
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 sticky top-0 z-10">
                  <tr className="text-left">
                    <th className="w-10 px-2 py-2">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={!allSelected && someSelected}
                        onCheckedChange={(v) => handleToggleAll(v === true)}
                        aria-label="Tout sélectionner"
                      />
                    </th>
                    <th className="px-2 py-2 font-medium">{'Contrat'}</th>
                    <th className="px-2 py-2 font-medium">{'Apprenant'}</th>
                    <th className="px-2 py-2 font-medium">{'Formation'}</th>
                    <th className="px-2 py-2 text-right font-medium">
                      {'NPEC'}
                    </th>
                    <th className="w-20 px-2 py-2 font-medium">{'Mois'}</th>
                    <th className="px-2 py-2 font-medium">{'Description'}</th>
                    <th className="w-32 px-2 py-2 text-right font-medium">
                      {'Montant HT'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {projetData.contrats.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="text-muted-foreground px-2 py-6 text-center"
                      >
                        {'Aucun contrat actif sur ce projet.'}
                      </td>
                    </tr>
                  )}
                  {projetData.contrats.map((c, idx) => {
                    const ligne = lignes[idx];
                    if (!ligne) return null;
                    const isFirstSelected =
                      ligne.selected &&
                      !lignes.slice(0, idx).some((l) => l.selected);
                    return (
                      <tr
                        key={c.id}
                        className={cn(
                          'border-t',
                          ligne.selected ? '' : 'bg-muted/20 opacity-70',
                        )}
                      >
                        <td className="px-2 py-2 align-top">
                          <Checkbox
                            checked={ligne.selected}
                            onCheckedChange={(v) =>
                              handleToggleOne(idx, v === true)
                            }
                            aria-label={`Sélectionner ${c.ref ?? c.contract_number ?? ''}`}
                          />
                        </td>
                        <td className="px-2 py-2 align-top font-mono text-[11px]">
                          {c.ref ??
                            c.contract_number ??
                            c.internal_number ??
                            ''}
                        </td>
                        <td className="px-2 py-2 align-top">
                          {[c.apprenant_prenom, c.apprenant_nom]
                            .filter(Boolean)
                            .join(' ') || '-'}
                        </td>
                        <td className="px-2 py-2 align-top">
                          <span className="line-clamp-2">
                            {c.formation_titre ?? '-'}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right align-top font-mono tabular-nums">
                          {formatCurrency(Number(c.npec_amount ?? 0))}
                        </td>
                        <td className="px-2 py-2 align-top">
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={ligne.moisRelatif}
                            onChange={(e) =>
                              handleMoisLigneChange(
                                idx,
                                Number(e.target.value) || 0,
                              )
                            }
                            disabled={!ligne.selected}
                            className="h-7 w-16 text-xs"
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <Input
                            ref={isFirstSelected ? firstDescRef : undefined}
                            type="text"
                            value={ligne.description}
                            onChange={(e) =>
                              handleDescriptionChange(idx, e.target.value)
                            }
                            disabled={!ligne.selected}
                            className="h-7 w-full text-xs"
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={ligne.montantHt}
                            onChange={(e) =>
                              handleMontantChange(
                                idx,
                                Number(e.target.value) || 0,
                              )
                            }
                            disabled={!ligne.selected}
                            aria-invalid={
                              ligne.selected && ligne.montantHt <= 0
                            }
                            className="h-7 w-28 text-right text-xs tabular-nums"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {step === 2 ? (
            <div className="text-muted-foreground flex-1 text-xs">
              {selectedLignes.length}
              {' contrat'}
              {selectedLignes.length > 1 ? 's' : ''}
              {' - Total HT '}
              <span className="text-foreground font-mono font-semibold tabular-nums">
                {formatCurrency(totalHt)}
              </span>
            </div>
          ) : (
            <div className="flex-1" />
          )}
          <div className="flex items-center gap-2">
            {step === 2 && (
              <Button
                variant="ghost"
                onClick={() => setStep(1)}
                disabled={isSubmitting}
              >
                {'Précédent'}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              {'Annuler'}
            </Button>
            {step === 1 ? (
              <Button
                onClick={handleNext}
                disabled={!projetId || isLoadingContrats}
              >
                {isLoadingContrats ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    {'Chargement...'}
                  </>
                ) : (
                  'Suivant'
                )}
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    {'Création...'}
                  </>
                ) : (
                  'Préparer le brouillon'
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
