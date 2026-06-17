'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { useCmdEnter } from '@/lib/hooks/use-cmd-enter';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { createProspect, lookupSiren } from '@/lib/actions/prospects';
import {
  TYPE_PROSPECT_LABELS,
  CANAL_ORIGINE_LABELS,
  STAGE_PROSPECT_LABELS,
  type TypeProspect,
  type CanalOrigine,
} from '@/lib/utils/constants';
import type { ProspectDuplicate } from '@/lib/queries/prospects';
import type { EntrepriseInsee } from '@/lib/insee/recherche-entreprises';

const CANAL_ENTRIES = Object.entries(CANAL_ORIGINE_LABELS) as [
  CanalOrigine,
  string,
][];

interface ProspectCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProspectCreateDialog({
  open,
  onOpenChange,
  // oxlint-disable-next-line react-doctor/prefer-useReducer
}: ProspectCreateDialogProps) {
  const { push } = useRouter();
  const [nom, setNom] = useState('');
  const [typeProspect, setTypeProspect] = useState<TypeProspect>('entreprise');
  const [canalOrigine, setCanalOrigine] = useState('');
  const [siren, setSiren] = useState('');
  const [volume, setVolume] = useState('');
  const [notes, setNotes] = useState('');
  const [insee, setInsee] = useState<EntrepriseInsee | null>(null);
  const [lookupPending, setLookupPending] = useState(false);
  const [duplicates, setDuplicates] = useState<ProspectDuplicate[] | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setNom('');
    setTypeProspect('entreprise');
    setCanalOrigine('');
    setSiren('');
    setVolume('');
    setNotes('');
    setInsee(null);
    setDuplicates(null);
  }

  const handleSirenBlur = useCallback(async () => {
    const clean = siren.trim();
    if (!/^\d{9}$/.test(clean)) return;
    setLookupPending(true);
    try {
      const entreprise = await lookupSiren(clean);
      if (entreprise) {
        setInsee(entreprise);
        if (entreprise.raisonSociale) setNom(entreprise.raisonSociale);
      } else {
        setInsee(null);
        toast.error('Entreprise introuvable pour ce SIREN');
      }
    } finally {
      setLookupPending(false);
    }
  }, [siren]);

  const handleSubmit = useCallback(
    function handleSubmit() {
      const cleanNom = nom.trim();
      if (cleanNom.length < 2) {
        toast.error('La raison sociale est requise (2 caractères min)');
        return;
      }
      if (!canalOrigine) {
        toast.error("Le canal d'origine est requis");
        return;
      }

      let volumeApprenants: number | undefined;
      if (volume.trim()) {
        const parsed = parseInt(volume, 10);
        if (Number.isNaN(parsed) || parsed <= 0) {
          toast.error('Le volume doit être un nombre positif');
          return;
        }
        volumeApprenants = parsed;
      }

      startTransition(async () => {
        const result = await createProspect({
          nom: cleanNom,
          typeProspect,
          canalOrigine: canalOrigine as CanalOrigine,
          siren: siren.trim() || undefined,
          volumeApprenants,
          notes: notes.trim() || undefined,
        });

        if (result.duplicates && result.duplicates.length > 0) {
          setDuplicates(result.duplicates);
          return;
        }
        if (result.success && result.id) {
          toast.success('Prospect créé');
          onOpenChange(false);
          resetForm();
          push(`/commercial/prospects/${result.id}`);
        } else {
          toast.error(result.error ?? 'Erreur lors de la création');
        }
      });
    },
    [nom, canalOrigine, volume, typeProspect, siren, notes, onOpenChange, push],
  );

  useCmdEnter(handleSubmit, open && !isPending && !duplicates);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouveau prospect</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Raison sociale */}
            <div className="space-y-2">
              <Label htmlFor="prospect-nom">Raison sociale</Label>
              <Input
                id="prospect-nom"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Nom de l'entreprise ou du CFA"
              />
            </div>

            {/* Tunnel */}
            <div className="space-y-2">
              <Label htmlFor="prospect-type">Tunnel</Label>
              <Select
                value={typeProspect}
                onValueChange={(v) =>
                  setTypeProspect((v as TypeProspect) ?? 'entreprise')
                }
              >
                <SelectTrigger className="w-full" id="prospect-type">
                  <SelectValue>
                    {(v) =>
                      TYPE_PROSPECT_LABELS[v as TypeProspect] ?? 'Entreprise'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entreprise">
                    {TYPE_PROSPECT_LABELS.entreprise}
                  </SelectItem>
                  <SelectItem value="cfa">
                    {TYPE_PROSPECT_LABELS.cfa}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Canal d'origine */}
            <div className="space-y-2">
              <Label htmlFor="prospect-canal">Canal d&apos;origine</Label>
              <Select
                value={canalOrigine}
                onValueChange={(v) => setCanalOrigine(v ?? '')}
              >
                <SelectTrigger className="w-full" id="prospect-canal">
                  <SelectValue placeholder="Sélectionner un canal">
                    {(v) =>
                      v
                        ? (CANAL_ORIGINE_LABELS[v as CanalOrigine] ?? v)
                        : 'Sélectionner un canal'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CANAL_ENTRIES.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* SIREN */}
            <div className="space-y-2">
              <Label htmlFor="prospect-siren">SIREN (optionnel)</Label>
              <Input
                id="prospect-siren"
                value={siren}
                onChange={(e) => setSiren(e.target.value)}
                onBlur={handleSirenBlur}
                placeholder="9 chiffres"
                inputMode="numeric"
              />
              {lookupPending && (
                <p className="text-muted-foreground text-xs">
                  Recherche INSEE en cours...
                </p>
              )}
              {insee && (
                <p className="text-muted-foreground text-xs">
                  {insee.raisonSociale}
                  {insee.effectifTranche ? ` · ${insee.effectifTranche}` : ''}
                  {insee.codeNaf ? ` · NAF ${insee.codeNaf}` : ''}
                </p>
              )}
            </div>

            {/* Volume potentiel */}
            <div className="space-y-2">
              <Label htmlFor="prospect-volume">
                Volume potentiel (optionnel)
              </Label>
              <Input
                id="prospect-volume"
                type="number"
                min="1"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                placeholder="Nombre d'apprenants"
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="prospect-notes">Notes (optionnel)</Label>
              <Textarea
                id="prospect-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? 'Création...' : 'Créer le prospect'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modale bloquante : doublon detecte (Feature 2 §7, pas de « créer quand même »). */}
      <Dialog
        open={duplicates !== null}
        onOpenChange={(o) => {
          if (!o) setDuplicates(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Prospect déjà existant</DialogTitle>
            <DialogDescription>
              Un ou plusieurs prospects similaires existent déjà. La création
              est bloquée pour éviter les doublons.
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2">
            {(duplicates ?? []).map((dup) => (
              <li
                key={dup.id}
                className="border-border flex items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{dup.nom}</p>
                  <p className="text-muted-foreground text-xs">
                    {STAGE_PROSPECT_LABELS[dup.stage] ?? dup.stage}
                  </p>
                </div>
                <Link
                  href={`/commercial/prospects/${dup.id}`}
                  className="text-primary text-sm font-medium hover:underline"
                >
                  Ouvrir la fiche
                </Link>
              </li>
            ))}
          </ul>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDuplicates(null)}>
              Annuler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
