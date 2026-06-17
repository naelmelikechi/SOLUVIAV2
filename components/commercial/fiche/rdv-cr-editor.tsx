'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { updateRdvCompteRendu } from '@/lib/actions/rdv';
import { getNoteGabarit, GABARIT_VERSION } from '@/lib/utils/rdv-gabarits';
import { TYPE_RDV_LABELS, type TypeRdv } from '@/lib/utils/constants';
import type { RdvCommercialWithRefs } from '@/lib/queries/rdv';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rdv: RdvCommercialWithRefs;
}

interface BodyProps {
  rdv: RdvCommercialWithRefs;
  onClose: () => void;
}

// oxlint-disable-next-line react-doctor/no-multi-comp
function RdvCrBody({ rdv, onClose }: BodyProps) {
  const router = useRouter();
  const [compteRendu, setCompteRendu] = useState(rdv.compte_rendu ?? '');
  const [crFinalise, setCrFinalise] = useState(rdv.cr_finalise);
  const [gabaritVersion, setGabaritVersion] = useState<string | null>(
    rdv.gabarit_version,
  );
  const [isPending, startTransition] = useTransition();

  function loadGabarit() {
    if (compteRendu.trim() !== '') {
      toast.info('Le compte-rendu contient déjà du texte.');
      return;
    }
    setCompteRendu(getNoteGabarit(rdv.type_rdv as TypeRdv));
    setGabaritVersion(GABARIT_VERSION);
  }

  function handleSave() {
    startTransition(async () => {
      const r = await updateRdvCompteRendu({
        id: rdv.id,
        compteRendu: compteRendu.trim() || null,
        crFinalise,
        gabaritVersion,
      });
      if (r.success) {
        toast.success('Compte-rendu enregistré');
        onClose();
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="cr-text">Compte-rendu</Label>
          <Button variant="outline" size="sm" onClick={loadGabarit}>
            Charger le gabarit
          </Button>
        </div>
        <Textarea
          id="cr-text"
          value={compteRendu}
          onChange={(e) => setCompteRendu(e.target.value)}
          rows={16}
          className="font-mono text-xs"
          placeholder="Saisir le compte-rendu ou charger le gabarit..."
        />
        {gabaritVersion && (
          <p className="text-muted-foreground text-xs">
            Gabarit : {gabaritVersion}
          </p>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={crFinalise}
            onCheckedChange={(v) => setCrFinalise(v === true)}
          />
          Finaliser le compte-rendu (le verrouille en lecture)
        </label>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Annuler
        </Button>
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </DialogFooter>
    </>
  );
}

export function RdvCrEditor({ open, onOpenChange, rdv }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="text-primary size-4" />
            Compte-rendu — {TYPE_RDV_LABELS[rdv.type_rdv as TypeRdv]}
          </DialogTitle>
        </DialogHeader>
        <RdvCrBody
          key={`${rdv.id}-${String(open)}`}
          rdv={rdv}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
