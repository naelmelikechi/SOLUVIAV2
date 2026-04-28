'use client';

import { useMemo, useState, useTransition } from 'react';
import { Users, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { addClientContact, deleteClientContact } from '@/lib/actions/clients';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  TableSearchInput,
  filterBySearch,
} from '@/components/shared/table-search-input';
import type { ClientContact } from '@/lib/queries/clients';

interface ClientContactsSectionProps {
  clientId: string;
  contacts: ClientContact[];
}

export function ClientContactsSection({
  clientId,
  contacts,
}: ClientContactsSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [nom, setNom] = useState('');
  const [poste, setPoste] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    nom: string;
  } | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () =>
      filterBySearch(contacts, search, (c) =>
        [c.nom, c.poste, c.email, c.telephone].filter(Boolean).join(' '),
      ),
    [contacts, search],
  );

  function resetForm() {
    setNom('');
    setPoste('');
    setEmail('');
    setTelephone('');
    setShowForm(false);
  }

  function handleAdd() {
    if (!nom.trim()) {
      toast.error('Le nom est requis');
      return;
    }

    startTransition(async () => {
      const result = await addClientContact(clientId, {
        nom,
        poste: poste || null,
        email: email || null,
        telephone: telephone || null,
      });
      if (result.success) {
        toast.success('Contact ajouté');
        resetForm();
      } else {
        toast.error(result.error ?? "Erreur lors de l'ajout");
      }
    });
  }

  function handleDelete(contactId: string, contactNom: string) {
    setDeleteTarget({ id: contactId, nom: contactNom });
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;

    startTransition(async () => {
      const result = await deleteClientContact(deleteTarget.id, clientId);
      if (result.success) {
        toast.success('Contact supprimé');
        setDeleteTarget(null);
      } else {
        toast.error(result.error ?? 'Erreur lors de la suppression');
      }
    });
  }

  return (
    <Card className="mb-6 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4" /> Contacts
        </h3>
        {!showForm && (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Ajouter
          </Button>
        )}
      </div>

      {showForm && (
        <div className="bg-muted/50 mb-4 rounded-lg border p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder="Nom *"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
            />
            <Input
              placeholder="Poste"
              value={poste}
              onChange={(e) => setPoste(e.target.value)}
            />
            <Input
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              placeholder="Téléphone"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={resetForm}>
              Annuler
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={isPending}>
              {isPending ? 'Ajout...' : 'Ajouter le contact'}
            </Button>
          </div>
        </div>
      )}

      {contacts.length === 0 && !showForm ? (
        <p className="text-muted-foreground text-sm">Aucun contact</p>
      ) : contacts.length > 0 ? (
        <div className="space-y-3">
          <TableSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Rechercher un contact..."
          />
          <div className="border-border overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Poste</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-muted-foreground h-12 text-center text-sm"
                    >
                      Aucun résultat.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm font-medium">
                      {c.nom}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {c.poste || '\u2014'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.email || '\u2014'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.telephone || '\u2014'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(c.id, c.nom)}
                        disabled={isPending}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Supprimer le contact"
        description={`Voulez-vous vraiment supprimer le contact "${deleteTarget?.nom}" ? Cette action est irréversible.`}
        confirmText="Supprimer"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        isPending={isPending}
      />
    </Card>
  );
}
