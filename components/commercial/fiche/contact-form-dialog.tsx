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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  addProspectContact,
  updateProspectContact,
} from '@/lib/actions/prospects';
import {
  ROLE_DECISION_LABELS,
  type RoleDecisionContact,
} from '@/lib/utils/constants';
import type { ProspectContact } from '@/lib/queries/prospects';

const ROLE_ENTRIES = Object.entries(ROLE_DECISION_LABELS) as [
  RoleDecisionContact,
  string,
][];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospectId: string;
  contact?: ProspectContact | null;
}

interface BodyProps {
  prospectId: string;
  contact: ProspectContact | null | undefined;
  onClose: () => void;
}

// oxlint-disable-next-line react-doctor/no-multi-comp
function ContactFormBody({ prospectId, contact, onClose }: BodyProps) {
  const router = useRouter();
  const [nom, setNom] = useState(contact?.nom ?? '');
  const [poste, setPoste] = useState(contact?.poste ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [telephone, setTelephone] = useState(contact?.telephone ?? '');
  const [roleDecision, setRoleDecision] = useState<string>(
    contact?.role_decision ?? '',
  );
  const [sensibilites, setSensibilites] = useState(contact?.sensibilites ?? '');
  const [linkedin, setLinkedin] = useState(contact?.linkedin ?? '');
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!nom.trim()) {
      toast.error('Le nom est requis');
      return;
    }
    const payload = {
      nom: nom.trim(),
      poste: poste.trim() || null,
      email: email.trim() || null,
      telephone: telephone.trim() || null,
      roleDecision: (roleDecision || null) as RoleDecisionContact | null,
      sensibilites: sensibilites.trim() || null,
      linkedin: linkedin.trim() || null,
    };
    startTransition(async () => {
      const r = contact
        ? await updateProspectContact(contact.id, payload)
        : await addProspectContact(prospectId, payload);
      if (r.success) {
        toast.success(
          contact ? 'Interlocuteur modifié' : 'Interlocuteur ajouté',
        );
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
        <div className="space-y-2">
          <Label htmlFor="contact-nom">Nom</Label>
          <Input
            id="contact-nom"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="contact-poste">Poste</Label>
            <Input
              id="contact-poste"
              value={poste}
              onChange={(e) => setPoste(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-role">Rôle décision</Label>
            <Select
              value={roleDecision}
              onValueChange={(v) => setRoleDecision(v ?? '')}
            >
              <SelectTrigger className="w-full" id="contact-role">
                <SelectValue placeholder="Non renseigné">
                  {(v) =>
                    v
                      ? ROLE_DECISION_LABELS[v as RoleDecisionContact]
                      : 'Non renseigné'
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Non renseigné</SelectItem>
                {ROLE_ENTRIES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-email">Email</Label>
            <Input
              id="contact-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-tel">Téléphone</Label>
            <Input
              id="contact-tel"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-linkedin">LinkedIn</Label>
          <Input
            id="contact-linkedin"
            value={linkedin}
            onChange={(e) => setLinkedin(e.target.value)}
            placeholder="https://www.linkedin.com/in/..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-sensibilites">Sensibilités</Label>
          <Textarea
            id="contact-sensibilites"
            rows={2}
            value={sensibilites}
            onChange={(e) => setSensibilites(e.target.value)}
            placeholder="Centres d'intérêt, points d'attention, ton à adopter..."
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={isPending || !nom.trim()}>
          {isPending
            ? 'Enregistrement...'
            : contact
              ? 'Enregistrer'
              : 'Ajouter'}
        </Button>
      </DialogFooter>
    </>
  );
}

export function ContactFormDialog({
  open,
  onOpenChange,
  prospectId,
  contact,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {contact ? 'Modifier l\u2019interlocuteur' : 'Nouvel interlocuteur'}
          </DialogTitle>
        </DialogHeader>
        <ContactFormBody
          key={`${contact?.id ?? 'new'}-${String(open)}`}
          prospectId={prospectId}
          contact={contact}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
