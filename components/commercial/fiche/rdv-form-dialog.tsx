'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useCmdEnter } from '@/lib/hooks/use-cmd-enter';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createRdvCommercial, updateRdvCommercial } from '@/lib/actions/rdv';
import {
  TYPE_RDV_LABELS,
  FORMAT_RDV_LABELS,
  STATUT_RDV_LABELS,
  type TypeRdv,
  type FormatRdv,
  type StatutRdv,
} from '@/lib/utils/constants';
import type { ProspectContact } from '@/lib/queries/prospects';
import type { RdvCommercialWithRefs } from '@/lib/queries/rdv';
import type { FicheCommercial } from './fiche-tabs';

const TYPE_ENTRIES = Object.entries(TYPE_RDV_LABELS) as [TypeRdv, string][];
const FORMAT_ENTRIES = Object.entries(FORMAT_RDV_LABELS) as [
  FormatRdv,
  string,
][];
const STATUT_ENTRIES = Object.entries(STATUT_RDV_LABELS) as [
  StatutRdv,
  string,
][];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospectId: string;
  contacts: ProspectContact[];
  commerciaux: FicheCommercial[];
  rdv?: RdvCommercialWithRefs | null;
}

interface BodyProps {
  prospectId: string;
  contacts: ProspectContact[];
  commerciaux: FicheCommercial[];
  rdv: RdvCommercialWithRefs | null | undefined;
  onClose: () => void;
}

// oxlint-disable-next-line react-doctor/no-multi-comp
function RdvFormBody({
  prospectId,
  contacts,
  commerciaux,
  rdv,
  onClose,
}: BodyProps) {
  const router = useRouter();
  const isEdit = rdv != null;
  const [datePrevue, setDatePrevue] = useState(rdv?.date_prevue ?? '');
  const [typeRdv, setTypeRdv] = useState<TypeRdv>(
    (rdv?.type_rdv as TypeRdv) ?? 'presentation',
  );
  const [format, setFormat] = useState<string>(rdv?.format ?? '');
  const [lieu, setLieu] = useState(rdv?.lieu ?? '');
  const [dureeMin, setDureeMin] = useState(
    rdv?.duree_min != null ? String(rdv.duree_min) : '',
  );
  const [objet, setObjet] = useState(rdv?.objet ?? '');
  const [statut, setStatut] = useState<StatutRdv>(
    (rdv?.statut as StatutRdv) ?? 'prevu',
  );
  const [partProspect, setPartProspect] = useState<string[]>(
    rdv?.participants_prospect ?? [],
  );
  const [partSoluvia, setPartSoluvia] = useState<string[]>(
    rdv?.participants_soluvia ?? [],
  );
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!datePrevue) {
      toast.error('La date est requise');
      return;
    }
    let duree: number | null = null;
    if (dureeMin.trim() !== '') {
      const n = parseInt(dureeMin, 10);
      if (Number.isNaN(n) || n < 0) {
        toast.error('Durée invalide');
        return;
      }
      duree = n;
    }
    const fmt = (format || null) as FormatRdv | null;

    startTransition(async () => {
      const r =
        isEdit && rdv
          ? await updateRdvCommercial({
              id: rdv.id,
              datePrevue,
              typeRdv,
              format: fmt,
              lieu: lieu.trim() || null,
              dureeMin: duree,
              statut,
              participantsProspect: partProspect,
              participantsSoluvia: partSoluvia,
              objet: objet.trim() || null,
            })
          : await createRdvCommercial(prospectId, {
              datePrevue,
              typeRdv,
              format: fmt,
              lieu: lieu.trim() || undefined,
              dureeMin: duree,
              participantsProspect: partProspect,
              participantsSoluvia: partSoluvia,
              objet: objet.trim() || undefined,
            });
      if (r.success) {
        toast.success(isEdit ? 'RDV modifié' : 'RDV créé');
        onClose();
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  useCmdEnter(handleSubmit, !isPending);

  return (
    <>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="rdv-date">Date prévue</Label>
            <Input
              id="rdv-date"
              type="date"
              value={datePrevue}
              onChange={(e) => setDatePrevue(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rdv-duree">Durée (min)</Label>
            <Input
              id="rdv-duree"
              type="number"
              min="0"
              value={dureeMin}
              onChange={(e) => setDureeMin(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rdv-type">Type</Label>
            <Select
              value={typeRdv}
              onValueChange={(v) => v && setTypeRdv(v as TypeRdv)}
            >
              <SelectTrigger className="w-full" id="rdv-type">
                <SelectValue>
                  {(v) => TYPE_RDV_LABELS[v as TypeRdv]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TYPE_ENTRIES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rdv-format">Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v ?? '')}>
              <SelectTrigger className="w-full" id="rdv-format">
                <SelectValue placeholder="Non défini">
                  {(v) =>
                    v ? FORMAT_RDV_LABELS[v as FormatRdv] : 'Non défini'
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Non défini</SelectItem>
                {FORMAT_ENTRIES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="rdv-lieu">Lieu / lien</Label>
          <Input
            id="rdv-lieu"
            value={lieu}
            onChange={(e) => setLieu(e.target.value)}
            placeholder="Adresse, ou lien visio"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="rdv-objet">Objet</Label>
          <Input
            id="rdv-objet"
            value={objet}
            onChange={(e) => setObjet(e.target.value)}
          />
        </div>

        {isEdit && (
          <div className="space-y-2">
            <Label htmlFor="rdv-statut">Statut</Label>
            <Select
              value={statut}
              onValueChange={(v) => v && setStatut(v as StatutRdv)}
            >
              <SelectTrigger className="w-full" id="rdv-statut">
                <SelectValue>
                  {(v) => STATUT_RDV_LABELS[v as StatutRdv]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUT_ENTRIES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Participants prospect</Label>
            {contacts.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                Aucun interlocuteur enregistré.
              </p>
            ) : (
              <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-md border p-2">
                {contacts.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={partProspect.includes(c.id)}
                      onCheckedChange={(checked) =>
                        setPartProspect((prev) =>
                          checked
                            ? [...prev, c.id]
                            : prev.filter((x) => x !== c.id),
                        )
                      }
                    />
                    {c.nom}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Participants Soluvia</Label>
            <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-md border p-2">
              {commerciaux.map((u) => (
                <label
                  key={u.id}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={partSoluvia.includes(u.id)}
                    onCheckedChange={(checked) =>
                      setPartSoluvia((prev) =>
                        checked
                          ? [...prev, u.id]
                          : prev.filter((x) => x !== u.id),
                      )
                    }
                  />
                  {u.prenom} {u.nom}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={isPending || !datePrevue}>
          {isPending ? 'Enregistrement...' : isEdit ? 'Enregistrer' : 'Créer'}
        </Button>
      </DialogFooter>
    </>
  );
}

export function RdvFormDialog({
  open,
  onOpenChange,
  prospectId,
  contacts,
  commerciaux,
  rdv,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {rdv != null ? 'Modifier le RDV' : 'Nouveau RDV'}
          </DialogTitle>
        </DialogHeader>
        <RdvFormBody
          key={`${rdv?.id ?? 'new'}-${String(open)}`}
          prospectId={prospectId}
          contacts={contacts}
          commerciaux={commerciaux}
          rdv={rdv}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
