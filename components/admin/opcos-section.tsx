'use client';

import { useState, useTransition } from 'react';
import { Plus, Edit, Archive, ArchiveRestore } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { archiveOpco, unarchiveOpco } from '@/lib/actions/opcos';
import { OpcoFormDialog } from '@/components/admin/opco-form-dialog';
import type { OpcoRow } from '@/lib/queries/opcos';

export function OpcosSection({ opcos }: { opcos: OpcoRow[] }) {
  const [editTarget, setEditTarget] = useState<OpcoRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleArchive(id: string, currentActif: boolean) {
    startTransition(async () => {
      const res = currentActif
        ? await archiveOpco(id)
        : await unarchiveOpco(id);
      if (res.success)
        toast.success(currentActif ? 'OPCO archivé' : 'OPCO réactivé');
      else toast.error(res.error ?? 'Erreur');
    });
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {opcos.length} OPCO référencés
        </h3>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 size-3.5" /> Nouvel OPCO
        </Button>
      </div>

      {opcos.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun OPCO configuré.</p>
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Préfixes DECA</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {opcos.map((o) => (
                <TableRow key={o.id} className={!o.actif ? 'opacity-60' : ''}>
                  <TableCell className="font-mono font-semibold">
                    {o.code}
                  </TableCell>
                  <TableCell>{o.nom}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {o.prefixes_deca.map((p) => (
                        <Badge
                          key={p}
                          variant="secondary"
                          className="font-mono text-xs"
                        >
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        o.actif
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-muted-foreground'
                      }
                    >
                      {o.actif ? 'Actif' : 'Archivé'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditTarget(o)}
                        aria-label="Modifier"
                        title="Modifier"
                      >
                        <Edit className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={isPending}
                        onClick={() => handleArchive(o.id, o.actif)}
                        aria-label={o.actif ? 'Archiver' : 'Réactiver'}
                        title={o.actif ? 'Archiver' : 'Réactiver'}
                      >
                        {o.actif ? (
                          <Archive className="size-3.5" />
                        ) : (
                          <ArchiveRestore className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <OpcoFormDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        opco={null}
      />
      <OpcoFormDialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        opco={editTarget}
      />
    </Card>
  );
}
