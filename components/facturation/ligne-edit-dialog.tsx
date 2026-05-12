'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useCmdEnter } from '@/lib/hooks/use-cmd-enter';
import {
  addLigneToBrouillon,
  updateLigneInBrouillon,
} from '@/lib/actions/facture-lignes';
import {
  checkDuplicate,
  fetchProjetContrats,
  type DuplicateCheckResult,
} from '@/lib/actions/facture-lignes-helpers';
import type { ProjetForFacturation } from '@/lib/queries/factures';

export type LigneEditMode =
  | {
      mode: 'add';
      factureId: string;
      projetId: string;
      estAvoir: boolean;
      defaultTauxCommission: number;
    }
  | {
      mode: 'edit';
      ligneId: string;
      initialDescription: string;
      initialMontantHt: number;
      estAvoir: boolean;
    };

interface LigneEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: LigneEditMode;
  onSuccess?: () => void;
}

type Contrat = ProjetForFacturation['contrats'][number];

function formatContratLabel(c: Contrat): string {
  const ref = c.ref ?? c.contract_number ?? c.internal_number ?? '';
  const prenom = c.apprenant_prenom ?? '';
  const nom = c.apprenant_nom ?? '';
  const formation = c.formation_titre ?? '';
  return `${ref} - ${prenom} ${nom} - ${formation}`.trim();
}

function buildAutoDescription(
  taux: number,
  c: Contrat | undefined,
  moisRelatif: number,
): string {
  if (!c) return '';
  const formation = c.formation_titre ?? '';
  const prenom = c.apprenant_prenom ?? '';
  const nom = c.apprenant_nom ?? '';
  return `Commission ${taux}% - ${formation} - ${prenom} ${nom} - mois M+${moisRelatif}`;
}

function suggestMontant(
  npec: number,
  taux: number,
  moisRelatif: number,
): number {
  const moisCap = Math.min(Math.max(moisRelatif, 0), 12);
  const total = (npec * taux) / 100;
  return Math.round((total / 12) * moisCap * 100) / 100;
}

export function LigneEditDialog(props: LigneEditDialogProps) {
  // Le composant interne se remonte a chaque (re)ouverture grace a une key
  // basee sur la config -> initial state recalcule sans setState in effect.
  const { open, config } = props;
  const instanceKey = open
    ? config.mode === 'add'
      ? `add-${config.factureId}-open`
      : `edit-${config.ligneId}-open`
    : 'closed';
  return <LigneEditDialogInner key={instanceKey} {...props} />;
}

function LigneEditDialogInner({
  open,
  onOpenChange,
  config,
  onSuccess,
}: LigneEditDialogProps) {
  const [isPending, startTransition] = useTransition();

  // ---------- mode add state (initialized once via key remount) ----------
  const [projetData, setProjetData] = useState<ProjetForFacturation | null>(
    null,
  );
  const [loadingContrats, setLoadingContrats] = useState(config.mode === 'add');
  const [contratId, setContratId] = useState<string>('');
  const [moisRelatif, setMoisRelatif] = useState<number>(1);
  const [montantHtUser, setMontantHtUser] = useState<string | null>(null);
  const [descriptionUser, setDescriptionUser] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateCheckResult>({
    duplicate: false,
  });

  // ---------- mode edit state ----------
  const [editDescription, setEditDescription] = useState<string>(
    config.mode === 'edit' ? config.initialDescription : '',
  );
  const [editMontantHt, setEditMontantHt] = useState<string>(
    config.mode === 'edit' ? Math.abs(config.initialMontantHt).toString() : '',
  );

  // Fetch contrats for project (mode add)
  useEffect(() => {
    if (config.mode !== 'add') return;
    let cancelled = false;
    (async () => {
      const data = await fetchProjetContrats(config.projetId);
      if (cancelled) return;
      setProjetData(data);
      setLoadingContrats(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [config]);

  const selectedContrat = useMemo<Contrat | undefined>(() => {
    if (config.mode !== 'add' || !projetData) return undefined;
    return projetData.contrats.find((c) => c.id === contratId);
  }, [config, projetData, contratId]);

  // Suggestions derived in render (no setState in effect)
  const taux = config.mode === 'add' ? config.defaultTauxCommission : 0;
  const montantSuggested = useMemo(() => {
    if (!selectedContrat) return '';
    return suggestMontant(
      Number(selectedContrat.npec_amount ?? 0),
      taux,
      moisRelatif,
    ).toFixed(2);
  }, [selectedContrat, taux, moisRelatif]);
  const descriptionSuggested = useMemo(() => {
    return buildAutoDescription(taux, selectedContrat, moisRelatif);
  }, [taux, selectedContrat, moisRelatif]);

  const montantHt = montantHtUser ?? montantSuggested;
  const description = descriptionUser ?? descriptionSuggested;

  // Duplicate detection (mode add) — only setState in async resolution
  useEffect(() => {
    if (config.mode !== 'add') return;
    if (!contratId || !Number.isFinite(moisRelatif)) {
      // No setState here: just skip — keep last value (will be reset on remount)
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await checkDuplicate(
        contratId,
        moisRelatif,
        config.factureId,
      );
      if (!cancelled) setDuplicate(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [config, contratId, moisRelatif]);

  // Reset duplicate banner if user clears contrat
  const showDuplicate =
    config.mode === 'add' && !!contratId && duplicate.duplicate;

  const handleAdd = useCallback(() => {
    if (config.mode !== 'add') return;
    if (!contratId) {
      toast.error('Sélectionnez un contrat');
      return;
    }
    if (!description.trim()) {
      toast.error('Description requise');
      return;
    }
    const montantValue = parseFloat(montantHt);
    if (!Number.isFinite(montantValue) || montantValue <= 0) {
      toast.error('Montant invalide');
      return;
    }
    if (!Number.isInteger(moisRelatif) || moisRelatif < 0 || moisRelatif > 60) {
      toast.error('Mois relatif invalide (0-60)');
      return;
    }
    const npec = Number(selectedContrat?.npec_amount ?? 0);
    const moisCap = Math.min(Math.max(moisRelatif, 0), 12);
    startTransition(async () => {
      const result = await addLigneToBrouillon({
        factureId: config.factureId,
        contratId,
        description: description.trim(),
        montantHt: montantValue,
        moisRelatif,
        quotePart: moisCap / 12,
        npecSnapshot: npec,
        tauxCommissionSnapshot: config.defaultTauxCommission,
      });
      if (result.success) {
        toast.success('Ligne ajoutée');
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(result.error ?? 'Erreur lors de l’ajout');
      }
    });
  }, [
    config,
    contratId,
    description,
    montantHt,
    moisRelatif,
    selectedContrat,
    onOpenChange,
    onSuccess,
  ]);

  const handleEdit = useCallback(() => {
    if (config.mode !== 'edit') return;
    if (!editDescription.trim()) {
      toast.error('Description requise');
      return;
    }
    const montantValue = parseFloat(editMontantHt);
    if (!Number.isFinite(montantValue) || montantValue <= 0) {
      toast.error('Montant invalide');
      return;
    }
    startTransition(async () => {
      const result = await updateLigneInBrouillon({
        ligneId: config.ligneId,
        description: editDescription.trim(),
        montantHt: montantValue,
      });
      if (result.success) {
        toast.success('Ligne mise à jour');
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(result.error ?? 'Erreur lors de la mise à jour');
      }
    });
  }, [config, editDescription, editMontantHt, onOpenChange, onSuccess]);

  const handleConfirm = config.mode === 'add' ? handleAdd : handleEdit;
  useCmdEnter(handleConfirm, open && !isPending);

  const isAvoir = config.estAvoir;
  const montantLabel = isAvoir ? 'Montant HT (sera négatif)' : 'Montant HT';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {config.mode === 'add' ? 'Ajouter une ligne' : 'Modifier la ligne'}
          </DialogTitle>
        </DialogHeader>

        {config.mode === 'add' ? (
          <div className="space-y-4">
            {/* Contrat */}
            <div className="space-y-2">
              <Label htmlFor="contrat">Contrat</Label>
              <Select
                value={contratId || undefined}
                onValueChange={(v) => setContratId(v ?? '')}
                disabled={loadingContrats || !projetData}
              >
                <SelectTrigger className="w-full" id="contrat">
                  <SelectValue
                    placeholder={
                      loadingContrats
                        ? 'Chargement…'
                        : 'Sélectionner un contrat'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(projetData?.contrats ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {formatContratLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {projetData && projetData.contrats.length === 0 && (
                <p className="text-muted-foreground text-xs">
                  Aucun contrat actif sur ce projet.
                </p>
              )}
            </div>

            {/* Mois relatif */}
            <div className="space-y-2">
              <Label htmlFor="mois">Mois (1 = M+1, 12 = M+12)</Label>
              <Input
                id="mois"
                type="number"
                min={0}
                max={60}
                step={1}
                value={moisRelatif}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setMoisRelatif(Number.isFinite(v) ? v : 0);
                }}
              />
            </div>

            {/* Montant HT */}
            <div className="space-y-2">
              <Label htmlFor="montant_ht">{montantLabel}</Label>
              <Input
                id="montant_ht"
                type="number"
                min="0"
                step="0.01"
                value={montantHt}
                onChange={(e) => {
                  setMontantHtUser(e.target.value);
                }}
              />
              {selectedContrat && (
                <p className="text-muted-foreground text-xs">
                  {`Suggestion auto : (NPEC ${Number(selectedContrat.npec_amount ?? 0).toFixed(2)} € × ${config.defaultTauxCommission}% / 12) × ${Math.min(moisRelatif, 12)} mois`}
                </p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => {
                  setDescriptionUser(e.target.value);
                }}
                placeholder="Description de la ligne…"
              />
            </div>

            {/* Warning duplicate */}
            {showDuplicate && duplicate.duplicate && (
              <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-xs text-yellow-900 dark:border-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-200">
                {`⚠️ Ce contrat est déjà facturé sur ${duplicate.onFactureRef ?? '(facture)'} (${duplicate.onFactureStatut}) pour ce mois (M+${duplicate.moisRelatif}). Vérifie que tu ne factures pas en double.`}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="edit_description">Description</Label>
              <Textarea
                id="edit_description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>

            {/* Montant HT */}
            <div className="space-y-2">
              <Label htmlFor="edit_montant_ht">{montantLabel}</Label>
              <Input
                id="edit_montant_ht"
                type="number"
                min="0"
                step="0.01"
                value={editMontantHt}
                onChange={(e) => setEditMontantHt(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Annuler
          </Button>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending
              ? 'En cours…'
              : config.mode === 'add'
                ? 'Ajouter'
                : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
