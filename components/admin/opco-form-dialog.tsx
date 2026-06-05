'use client';

import { useState, useTransition } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { createOpco, updateOpco } from '@/lib/actions/opcos';
import type { OpcoRow } from '@/lib/queries/opcos';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opco: OpcoRow | null;
}

function parseIdccCodes(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;\n]+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
    ),
  );
}

interface FormBodyProps {
  opco: OpcoRow | null;
  onClose: () => void;
}

function OpcoFormBody({ opco, onClose }: FormBodyProps) {
  const [code, setCode] = useState(opco?.code ?? '');
  const [nom, setNom] = useState(opco?.nom ?? '');
  const [idccRaw, setIdccRaw] = useState(
    opco ? opco.idcc_codes.join(', ') : '',
  );
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    const idccCodes = parseIdccCodes(idccRaw);
    if (idccCodes.length === 0) {
      toast.error('Au moins un IDCC requis');
      return;
    }
    startTransition(async () => {
      const res = opco
        ? await updateOpco({ id: opco.id, code, nom, idccCodes })
        : await createOpco({ code, nom, idccCodes });
      if (res.success) {
        toast.success(opco ? 'OPCO mis à jour' : 'OPCO créé');
        onClose();
      } else {
        toast.error(res.error ?? 'Erreur');
      }
    });
  }

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="opco-code">Code (majuscules, _ autorise)</Label>
          <Input
            id="opco-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="AKTO"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="opco-nom">Nom complet</Label>
          <Input
            id="opco-nom"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="AKTO - Commerce et services"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="opco-idcc">
            IDCC (conventions collectives, 4 chiffres, séparés par virgule)
          </Label>
          <Textarea
            id="opco-idcc"
            value={idccRaw}
            onChange={(e) => setIdccRaw(e.target.value)}
            placeholder="1979, 3032, 1527"
            rows={3}
          />
          <p className="text-muted-foreground text-xs">
            {
              "IDCC de la convention collective de l'employeur (champ idcc_code des entreprises Eduvia). Détermine légalement l'OPCO."
            }
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </DialogFooter>
    </>
  );
}

export function OpcoFormDialog({ open, onOpenChange, opco }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{opco ? 'Modifier OPCO' : 'Nouvel OPCO'}</DialogTitle>
        </DialogHeader>
        <OpcoFormBody
          key={`${opco?.id ?? 'new'}-${String(open)}`}
          opco={opco}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
