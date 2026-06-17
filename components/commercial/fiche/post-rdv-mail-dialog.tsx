'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Mail } from 'lucide-react';
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
import { formatDate } from '@/lib/utils/formatters';
import { getPostRdvMailDraft } from '@/lib/utils/rdv-gabarits';
import { sendProspectMail } from '@/lib/actions/prospect-mail';
import type { TypeRdv } from '@/lib/utils/constants';
import type { ProspectDetail, ProspectContact } from '@/lib/queries/prospects';
import type { RdvCommercialWithRefs } from '@/lib/queries/rdv';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect: ProspectDetail;
  rdv: RdvCommercialWithRefs;
  contacts: ProspectContact[];
  currentUserName: string;
}

interface BodyProps {
  prospect: ProspectDetail;
  rdv: RdvCommercialWithRefs;
  contacts: ProspectContact[];
  currentUserName: string;
  onClose: () => void;
}

// oxlint-disable-next-line react-doctor/no-multi-comp
function PostRdvMailBody({
  prospect,
  rdv,
  contacts,
  currentUserName,
  onClose,
}: BodyProps) {
  const router = useRouter();
  const principal =
    contacts.find((c) => c.id === prospect.contact_principal_id) ??
    contacts.find((c) => c.email) ??
    null;
  const developpeurNom = rdv.commercial
    ? `${rdv.commercial.prenom} ${rdv.commercial.nom}`
    : currentUserName;
  const draft = getPostRdvMailDraft({
    typeRdv: rdv.type_rdv as TypeRdv,
    raisonSociale: prospect.nom,
    contactNom: principal?.nom ?? undefined,
    dateRdv: formatDate(rdv.date_realisee ?? rdv.date_prevue),
    developpeurNom: developpeurNom || undefined,
  });

  const [to, setTo] = useState(principal?.email ?? '');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.bodyHtml);
  const [isPending, startTransition] = useTransition();

  function handleSend() {
    if (!to.trim()) {
      toast.error('Renseignez au moins un destinataire');
      return;
    }
    if (!subject.trim()) {
      toast.error('Le sujet est requis');
      return;
    }
    const ccList = cc
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);

    startTransition(async () => {
      const r = await sendProspectMail({
        prospectId: prospect.id,
        rdvId: rdv.id,
        to: to.trim(),
        cc: ccList.length > 0 ? ccList : undefined,
        subject: subject.trim(),
        bodyHtml: body,
        type: 'mail_post_rdv',
      });
      if (r.success) {
        toast.success('Mail envoyé');
        onClose();
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur lors de l\u2019envoi');
      }
    });
  }

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="mail-to">À</Label>
          <Input
            id="mail-to"
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="destinataire@exemple.fr"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mail-cc">Cc (optionnel)</Label>
          <Input
            id="mail-cc"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="Séparez les adresses par une virgule"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mail-subject">Sujet</Label>
          <Input
            id="mail-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mail-body">Corps (HTML)</Label>
          <Textarea
            id="mail-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            className="font-mono text-xs"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Annuler
        </Button>
        <Button
          onClick={handleSend}
          disabled={isPending || !to.trim() || !subject.trim()}
        >
          {isPending ? 'Envoi...' : 'Envoyer'}
        </Button>
      </DialogFooter>
    </>
  );
}

export function PostRdvMailDialog({
  open,
  onOpenChange,
  prospect,
  rdv,
  contacts,
  currentUserName,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="text-primary size-4" />
            Mail post-RDV
          </DialogTitle>
        </DialogHeader>
        <PostRdvMailBody
          key={`${rdv.id}-${String(open)}`}
          prospect={prospect}
          rdv={rdv}
          contacts={contacts}
          currentUserName={currentUserName}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
