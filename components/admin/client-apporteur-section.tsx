'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { HandCoins, Pencil, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils/formatters';
import { updateClientApporteur } from '@/lib/actions/clients';
import type { ActiveUserMinimal } from '@/lib/queries/users';

interface ClientApporteurSectionProps {
  clientId: string;
  apporteur: { id: string; nom: string; prenom: string } | null;
  apporteurDate: string | null;
  users: ActiveUserMinimal[];
}

const NONE_VALUE = '__none__';

export function ClientApporteurSection({
  clientId,
  apporteur,
  apporteurDate,
  users,
}: ClientApporteurSectionProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [selectedId, setSelectedId] = useState<string>(
    apporteur?.id ?? NONE_VALUE,
  );
  const [date, setDate] = useState<string>(apporteurDate ?? '');

  function handleCancel() {
    setSelectedId(apporteur?.id ?? NONE_VALUE);
    setDate(apporteurDate ?? '');
    setEditing(false);
  }

  function handleSave() {
    const apporteurId = selectedId === NONE_VALUE ? null : selectedId;
    const payloadDate = apporteurId ? date || null : null;

    startTransition(async () => {
      const result = await updateClientApporteur(
        clientId,
        apporteurId,
        payloadDate,
      );
      if (result.success) {
        toast.success('Apporteur commercial mis à jour');
        setEditing(false);
        router.refresh();
      } else {
        toast.error(result.error ?? 'Erreur lors de la mise à jour');
      }
    });
  }

  return (
    <Card className="mb-6 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <HandCoins className="h-4 w-4" /> Apporteur commercial
        </h3>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Modifier
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="apporteur-select">Apporteur commercial</Label>
              <Select
                value={selectedId}
                onValueChange={(v) => setSelectedId(v ?? NONE_VALUE)}
              >
                <SelectTrigger className="w-full" id="apporteur-select">
                  <SelectValue placeholder="Aucun apporteur" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Aucun apporteur</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.prenom} {u.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="apporteur-date">Date d&apos;apport</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="apporteur-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={selectedId === NONE_VALUE}
                />
                {date && selectedId !== NONE_VALUE && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDate('')}
                    aria-label="Effacer la date"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {selectedId !== NONE_VALUE && !date && (
                <p className="text-muted-foreground text-xs">
                  La date sera fixée à aujourd&apos;hui si laissée vide.
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={handleCancel} disabled={isPending}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      ) : apporteur ? (
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
          <div>
            <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              Apporteur
            </div>
            <div className="mt-1">
              {apporteur.prenom} {apporteur.nom}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              Date d&apos;apport
            </div>
            <div className="mt-1 tabular-nums">
              {apporteurDate ? formatDate(apporteurDate) : '-'}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Aucun apporteur renseigné
        </p>
      )}
    </Card>
  );
}
