'use client';
import { useState, useTransition } from 'react';
import { Pencil } from 'lucide-react';
import { runWithToast } from '@/components/crm/shared/run-with-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ROLE_DECISION_LABELS } from '@/lib/utils/constants';
import { updateContactRole } from '@/lib/crm/actions/contacts';

export type OppContactRole = {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  telephone: string | null;
  principal: boolean;
  role_decision: string | null;
  sensibilites: string | null;
};

const ROLE_ITEMS = [
  { value: '', label: '— Rôle non défini —' },
  ...Object.entries(ROLE_DECISION_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

/** Bloc contact du drawer (A5) : affichage + édition inline du rôle décisionnel
 *  et des sensibilités, persistés via `updateContactRole`. */
export function OppContactRole({ contact }: { contact: OppContactRole }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [role, setRole] = useState(contact.role_decision ?? '');
  const [sensibilites, setSensibilites] = useState(contact.sensibilites ?? '');

  const nom = `${contact.prenom ?? ''} ${contact.nom ?? ''}`.trim() || '-';

  const save = () =>
    start(() =>
      runWithToast(
        () =>
          updateContactRole(contact.id, {
            role_decision: role,
            sensibilites,
          }),
        {
          success: 'Contact mis à jour',
          error: 'Mise à jour impossible',
          onSuccess: () => setEditing(false),
        },
      ),
    );

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="font-medium">{nom}</span>
        {contact.principal && (
          <Badge variant="secondary" className="text-[10px]">
            Principal
          </Badge>
        )}
        {contact.role_decision && !editing && (
          <Badge variant="outline" className="text-[10px]">
            {ROLE_DECISION_LABELS[
              contact.role_decision as keyof typeof ROLE_DECISION_LABELS
            ] ?? contact.role_decision}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground ml-auto h-6 px-2"
          onClick={() => setEditing((e) => !e)}
          aria-label="Modifier le rôle du contact"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
      {(contact.email || contact.telephone) && (
        <div className="text-muted-foreground mt-0.5 text-xs">
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="text-primary hover:underline"
            >
              {contact.email}
            </a>
          )}
          {contact.email && contact.telephone && ' · '}
          {contact.telephone && (
            <a
              href={`tel:${contact.telephone}`}
              className="text-primary hover:underline"
            >
              {contact.telephone}
            </a>
          )}
        </div>
      )}
      {!editing && contact.sensibilites && (
        <p className="text-muted-foreground mt-1 text-xs italic">
          {contact.sensibilites}
        </p>
      )}
      {editing && (
        <div className="mt-2 space-y-2">
          <div className="space-y-1.5">
            <Label>Rôle dans la décision</Label>
            <Select
              items={ROLE_ITEMS}
              value={role}
              onValueChange={(v) => {
                if (typeof v === 'string') setRole(v);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_ITEMS.map((it) => (
                  <SelectItem key={it.value} value={it.value}>
                    {it.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`sensibilites-${contact.id}`}>Sensibilités</Label>
            <Textarea
              id={`sensibilites-${contact.id}`}
              rows={2}
              value={sensibilites}
              onChange={(e) => setSensibilites(e.target.value)}
              placeholder="Ce à quoi l'interlocuteur est sensible…"
            />
          </div>
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? '…' : 'Enregistrer'}
          </Button>
        </div>
      )}
    </div>
  );
}
