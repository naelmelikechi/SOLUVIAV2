'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { sendDevis } from '@/lib/actions/devis';

interface SendDevisDialogProps {
  devisId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function parseEmails(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
}

export function SendDevisDialog({
  devisId,
  open,
  onOpenChange,
}: SendDevisDialogProps) {
  const router = useRouter();
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [pending, start] = useTransition();

  function reset() {
    setTo('');
    setCc('');
  }

  function handleOpenChange(next: boolean) {
    if (pending) return;
    onOpenChange(next);
    if (!next) reset();
  }

  function handleSubmit() {
    const toList = parseEmails(to);
    if (toList.length === 0) {
      toast.error('Au moins un destinataire est requis.');
      return;
    }
    const ccList = parseEmails(cc);
    start(async () => {
      const res = await sendDevis(devisId, { to: toList, cc: ccList });
      if (res.success) {
        toast.success(`Devis ${res.ref} envoyé.`);
        onOpenChange(false);
        reset();
        router.refresh();
      } else {
        toast.error(res.error ?? "Erreur lors de l'envoi.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Envoyer le devis</DialogTitle>
          <p className="text-muted-foreground text-xs">
            Un email avec le PDF joint sera envoyé aux destinataires.
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="send-to">Destinataires (To) *</Label>
            <Textarea
              id="send-to"
              rows={2}
              placeholder="contact@client.fr, autre@client.fr"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Séparez les adresses par une virgule ou un saut de ligne.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="send-cc">Copie (CC, optionnel)</Label>
            <Textarea
              id="send-cc"
              rows={1}
              placeholder="cdp@soluvia.fr"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={pending}
          >
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!to.trim() || pending}>
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Envoi...
              </>
            ) : (
              'Envoyer'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
