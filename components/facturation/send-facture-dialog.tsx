'use client';

import { useMemo, useState, useTransition, type KeyboardEvent } from 'react';
import { X, Mail, Plus } from 'lucide-react';
import { toast } from 'sonner';
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface FactureContact {
  id: string;
  nom: string;
  email: string | null;
  recoit_factures: boolean;
  recoit_factures_cc: boolean;
}

interface SendFactureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factureRef: string | null;
  contacts: FactureContact[];
  /**
   * Action declenchee a la validation. Recoit les listes finales TO/CC.
   * Retourne success/error pour afficher le toast adequat.
   */
  onConfirm: (recipients: {
    to: string[];
    cc: string[];
  }) => Promise<{ success: boolean; error?: string }>;
  /** Texte du bouton principal (defaut: "Envoyer"). */
  confirmLabel?: string;
  /** Titre du dialog (defaut: "Envoyer la facture par email"). */
  title?: string;
}

export function SendFactureDialog(props: SendFactureDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <Inner {...props} />}
    </Dialog>
  );
}

function Inner({
  factureRef,
  contacts,
  onConfirm,
  onOpenChange,
  confirmLabel = 'Envoyer',
  title = 'Envoyer la facture par email',
}: SendFactureDialogProps) {
  const initial = useMemo(() => {
    const to = contacts
      .filter((c) => c.recoit_factures && c.email && EMAIL_RE.test(c.email))
      .map((c) => c.email as string);
    const cc = contacts
      .filter((c) => c.recoit_factures_cc && c.email && EMAIL_RE.test(c.email))
      .map((c) => c.email as string);
    // Fallback si aucun contact flagge : prend le 1er contact avec email valide.
    if (to.length === 0) {
      const first = contacts.find(
        (c) => c.email && EMAIL_RE.test(c.email),
      )?.email;
      if (first) return { to: [first], cc };
    }
    return { to, cc };
  }, [contacts]);

  const [toList, setToList] = useState<string[]>(initial.to);
  const [ccList, setCcList] = useState<string[]>(initial.cc);
  const [toInput, setToInput] = useState('');
  const [ccInput, setCcInput] = useState('');
  const [isPending, startTransition] = useTransition();

  const usedEmails = new Set([...toList, ...ccList]);
  const suggestions = contacts.filter(
    (c) => c.email && EMAIL_RE.test(c.email) && !usedEmails.has(c.email),
  );

  const addEmail = (
    raw: string,
    target: 'to' | 'cc',
    clearInput: () => void,
  ) => {
    const email = raw.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      toast.error(`Email invalide : ${email}`);
      return;
    }
    if (usedEmails.has(email)) {
      toast.warning('Email déjà ajouté');
      return;
    }
    if (target === 'to') setToList((l) => [...l, email]);
    else setCcList((l) => [...l, email]);
    clearInput();
  };

  const removeEmail = (email: string, target: 'to' | 'cc') => {
    if (target === 'to') setToList((l) => l.filter((e) => e !== email));
    else setCcList((l) => l.filter((e) => e !== email));
  };

  const handleKeyDown = (
    target: 'to' | 'cc',
    e: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      const value = target === 'to' ? toInput : ccInput;
      addEmail(value, target, () =>
        target === 'to' ? setToInput('') : setCcInput(''),
      );
    } else if (
      e.key === 'Backspace' &&
      (target === 'to' ? toInput : ccInput) === ''
    ) {
      // Backspace sur input vide : retire le dernier email.
      if (target === 'to' && toList.length > 0) {
        setToList((l) => l.slice(0, -1));
      } else if (target === 'cc' && ccList.length > 0) {
        setCcList((l) => l.slice(0, -1));
      }
    }
  };

  const handleSubmit = () => {
    // Flush des inputs en cours si l'utilisateur clique Envoyer sans Enter.
    if (toInput.trim()) {
      const email = toInput.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) {
        toast.error(`Email invalide dans À : ${email}`);
        return;
      }
      if (!usedEmails.has(email)) toList.push(email);
      setToInput('');
    }
    if (ccInput.trim()) {
      const email = ccInput.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) {
        toast.error(`Email invalide dans Cc : ${email}`);
        return;
      }
      if (!usedEmails.has(email)) ccList.push(email);
      setCcInput('');
    }

    if (toList.length === 0) {
      toast.error('Au moins un destinataire (À) est requis');
      return;
    }

    startTransition(async () => {
      const result = await onConfirm({ to: toList, cc: ccList });
      if (result.success) {
        toast.success('Email envoyé');
        onOpenChange(false);
      } else {
        toast.error(result.error ?? "Erreur lors de l'envoi");
      }
    });
  };

  return (
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        {factureRef && (
          <p className="text-muted-foreground text-sm">
            Facture <span className="font-mono font-medium">{factureRef}</span>
          </p>
        )}

        {/* TO */}
        <RecipientField
          id="to"
          label="À"
          emails={toList}
          inputValue={toInput}
          onInputChange={setToInput}
          onRemove={(e) => removeEmail(e, 'to')}
          onKeyDown={(e) => handleKeyDown('to', e)}
          onBlur={() => {
            if (toInput.trim()) {
              addEmail(toInput, 'to', () => setToInput(''));
            }
          }}
          placeholder={
            toList.length === 0
              ? 'email@exemple.com'
              : 'Ajouter un destinataire...'
          }
        />

        {/* CC */}
        <RecipientField
          id="cc"
          label="Cc"
          emails={ccList}
          inputValue={ccInput}
          onInputChange={setCcInput}
          onRemove={(e) => removeEmail(e, 'cc')}
          onKeyDown={(e) => handleKeyDown('cc', e)}
          onBlur={() => {
            if (ccInput.trim()) {
              addEmail(ccInput, 'cc', () => setCcInput(''));
            }
          }}
          placeholder="email@exemple.com (optionnel)"
        />

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs font-normal">
              Contacts du client
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((c) => (
                <div
                  key={c.id}
                  className="border-border bg-muted/50 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                >
                  <span className="text-foreground">
                    {c.nom}
                    <span className="text-muted-foreground ml-1.5">
                      {c.email}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      addEmail(c.email!, 'to', () => setToInput(''))
                    }
                    className="hover:bg-background ml-1 rounded p-0.5"
                    title="Ajouter en À"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      addEmail(c.email!, 'cc', () => setCcInput(''))
                    }
                    className="hover:bg-background rounded px-1 py-0.5 text-[10px] font-medium uppercase"
                    title="Ajouter en Cc"
                  >
                    Cc
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-muted-foreground text-xs">
          Entrée, virgule ou espace pour ajouter une adresse. Backspace pour
          retirer la dernière. Maximum 20 destinataires par champ.
        </p>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={isPending}>
          <Mail className="mr-1.5 h-4 w-4" />
          {isPending ? 'Envoi...' : confirmLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function RecipientField({
  id,
  label,
  emails,
  inputValue,
  onInputChange,
  onRemove,
  onKeyDown,
  onBlur,
  placeholder,
}: {
  id: string;
  label: string;
  emails: string[];
  inputValue: string;
  onInputChange: (v: string) => void;
  onRemove: (email: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="border-input bg-background focus-within:ring-ring focus-within:border-ring flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 focus-within:ring-1">
        {emails.map((email) => (
          <span
            key={email}
            className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs"
          >
            {email}
            <button
              type="button"
              onClick={() => onRemove(email)}
              className="hover:bg-background/50 rounded p-0.5"
              aria-label={`Retirer ${email}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <Input
          id={id}
          type="email"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          placeholder={placeholder}
          className="h-6 min-w-[160px] flex-1 border-0 px-1 py-0 shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  );
}
