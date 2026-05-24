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

function parsePrefixes(raw: string): string[] {
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
  const [prefixesRaw, setPrefixesRaw] = useState(
    opco ? opco.prefixes_deca.join(', ') : '',
  );
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    const prefixes = parsePrefixes(prefixesRaw);
    if (prefixes.length === 0) {
      toast.error('Au moins un prefixe requis');
      return;
    }
    startTransition(async () => {
      const res = opco
        ? await updateOpco({ id: opco.id, code, nom, prefixesDeca: prefixes })
        : await createOpco({ code, nom, prefixesDeca: prefixes });
      if (res.success) {
        toast.success(opco ? 'OPCO mis a jour' : 'OPCO cree');
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
          <Label htmlFor="opco-prefixes">
            Prefixes DECA (3 chiffres, separes par virgule)
          </Label>
          <Textarea
            id="opco-prefixes"
            value={prefixesRaw}
            onChange={(e) => setPrefixesRaw(e.target.value)}
            placeholder="017, 030, 033, 050, 079, 089"
            rows={3}
          />
          <p className="text-muted-foreground text-xs">
            Les 3 premiers chiffres du numero DECA des contrats (ex :
            017202605001222 donne 017).
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
