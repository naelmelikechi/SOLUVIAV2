'use client';

import { useMemo, useState, useTransition } from 'react';
import { Key, Plus, Trash2, Wifi, WifiOff, Loader2 } from 'lucide-react';
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
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  TableSearchInput,
  filterBySearch,
} from '@/components/shared/table-search-input';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils/formatters';
import {
  addClientApiKey,
  deleteClientApiKey,
  toggleClientApiKeyActive,
  testApiKeyConnection,
} from '@/lib/actions/clients';
import type { ClientApiKey } from '@/lib/queries/clients';

interface ClientApiKeysSectionProps {
  clientId: string;
  apiKeys: ClientApiKey[];
}

export function ClientApiKeysSection({
  clientId,
  apiKeys,
}: ClientApiKeysSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [instanceUrl, setInstanceUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('');
  const [isPending, startTransition] = useTransition();
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string | null;
  } | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () =>
      filterBySearch(apiKeys, search, (k) =>
        [
          k.label,
          k.instance_url,
          k.api_key_masked,
          k.is_active ? 'Actif' : 'Inactif',
        ]
          .filter(Boolean)
          .join(' '),
      ),
    [apiKeys, search],
  );

  function resetForm() {
    setInstanceUrl('');
    setApiKey('');
    setLabel('');
    setShowForm(false);
  }

  function handleAdd() {
    if (!label.trim()) {
      toast.error('Le libellé est requis');
      return;
    }
    if (!instanceUrl.trim()) {
      toast.error("L'URL de l'instance est requise");
      return;
    }
    if (!instanceUrl.includes('.eduvia.app')) {
      toast.error("L'URL doit contenir .eduvia.app (ex: dupont.eduvia.app)");
      return;
    }
    if (!apiKey.trim()) {
      toast.error('La clé API est requise');
      return;
    }

    startTransition(async () => {
      const result = await addClientApiKey(clientId, {
        instanceUrl,
        apiKey,
        label,
      });
      if (result.success) {
        toast.success('Clé API ajoutée');
        resetForm();
      } else {
        toast.error(result.error ?? "Erreur lors de l'ajout");
      }
    });
  }

  function handleDelete(keyId: string, keyLabel: string | null) {
    setDeleteTarget({ id: keyId, label: keyLabel });
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;

    startTransition(async () => {
      const result = await deleteClientApiKey(deleteTarget.id);
      if (result.success) {
        toast.success('Clé API supprimée');
        setDeleteTarget(null);
      } else {
        toast.error(result.error ?? 'Erreur lors de la suppression');
      }
    });
  }

  function handleToggleActive(keyId: string, currentActive: boolean) {
    startTransition(async () => {
      const result = await toggleClientApiKeyActive(keyId, !currentActive);
      if (result.success) {
        toast.success(
          !currentActive ? 'Clé API activée' : 'Clé API désactivée',
        );
      } else {
        toast.error(result.error ?? 'Erreur lors de la mise à jour');
      }
    });
  }

  function handleTestConnection(keyId: string) {
    setTestingKeyId(keyId);
    startTransition(async () => {
      const result = await testApiKeyConnection(keyId);
      if (result.success) {
        toast.success('Connexion réussie');
      } else {
        toast.error(result.error ?? 'Échec de la connexion');
      }
      setTestingKeyId(null);
    });
  }

  return (
    <Card className="mb-6 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Key className="h-4 w-4" /> Clés API Eduvia
          <span className="text-muted-foreground text-xs font-normal">
            ({apiKeys.length})
          </span>
        </h3>
        {!showForm && (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Ajouter une clé API
          </Button>
        )}
      </div>

      {showForm && (
        <div className="bg-muted/50 mb-4 rounded-lg border p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              placeholder="Libellé * (ex: Instance principale)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <Input
              placeholder="URL instance * (ex: dupont.eduvia.app)"
              value={instanceUrl}
              onChange={(e) => setInstanceUrl(e.target.value)}
            />
            <Input
              placeholder="Clé API *"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={resetForm}>
              Annuler
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={isPending}>
              {isPending ? 'Ajout...' : 'Ajouter la clé'}
            </Button>
          </div>
        </div>
      )}

      {apiKeys.length === 0 && !showForm ? (
        <p className="text-muted-foreground text-sm">
          Aucune clé API configurée
        </p>
      ) : apiKeys.length > 0 ? (
        <div className="space-y-3">
          <TableSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Rechercher une clé API..."
          />
          <div className="border-border overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Libellé</TableHead>
                  <TableHead>Instance</TableHead>
                  <TableHead>Clé</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Dernière sync</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-muted-foreground h-12 text-center text-sm"
                    >
                      Aucun résultat.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="text-sm font-medium">
                      {k.label || '\u2014'}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {k.instance_url || '\u2014'}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {k.api_key_masked}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={k.is_active ? 'Actif' : 'Inactif'}
                        color={k.is_active ? 'green' : 'gray'}
                      />
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {k.last_sync_at ? formatDate(k.last_sync_at) : '\u2014'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleTestConnection(k.id)}
                          disabled={isPending || testingKeyId === k.id}
                          title="Tester la connexion"
                          className="text-muted-foreground hover:text-primary"
                        >
                          {testingKeyId === k.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Wifi className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleToggleActive(k.id, k.is_active)}
                          disabled={isPending}
                          title={k.is_active ? 'Désactiver' : 'Activer'}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {k.is_active ? (
                            <WifiOff className="h-3.5 w-3.5" />
                          ) : (
                            <Wifi className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDelete(k.id, k.label)}
                          disabled={isPending}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
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
        title="Supprimer la clé API"
        description={`Voulez-vous vraiment supprimer la clé API "${deleteTarget?.label ?? ''}" ? Cette action est irréversible.`}
        confirmText="Supprimer"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        isPending={isPending}
      />
    </Card>
  );
}
