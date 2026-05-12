'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CategorieFormDialog } from './categorie-form-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { archiveCategorieInterneAction } from '@/app/(dashboard)/projets/internes/actions';
import { cn } from '@/lib/utils';
import type {
  CategorieInterne,
  ProjetInterneEnrichi,
} from '@/lib/queries/projets-internes';

interface Props {
  categories: CategorieInterne[];
  projets: ProjetInterneEnrichi[];
}

export function InternesConfigTab({ categories, projets }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<CategorieInterne | undefined>();
  const [filter, setFilter] = useState<'actif' | 'archive'>('actif');
  const [pendingArchiveId, startArchive] = useTransition();
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CategorieInterne | null>(
    null,
  );

  // Indexe les projets par categorie pour afficher les heures 12m
  const heuresParCategorie = new Map<string, number>();
  for (const p of projets) {
    if (p.categorie) {
      heuresParCategorie.set(
        p.categorie.id,
        (heuresParCategorie.get(p.categorie.id) ?? 0) + p.heures_12mois,
      );
    }
  }

  const filtered = categories.filter((c) =>
    filter === 'actif' ? !c.archive : c.archive,
  );

  const handleArchiveConfirm = () => {
    if (!archiveTarget) return;
    const cat = archiveTarget;
    setArchivingId(cat.id);
    startArchive(async () => {
      const result = await archiveCategorieInterneAction(cat.id, cat.archive);
      setArchivingId(null);
      setArchiveTarget(null);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      if (result.data?.recentSaisies) {
        toast.warning(
          `Attention : ${result.data.recentSaisies} saisies dans les 30 derniers jours. Catégorie archivée quand même.`,
        );
      } else {
        toast.success(cat.archive ? 'Catégorie désarchivée' : 'Catégorie archivée');
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="bg-muted/30 border-border inline-flex items-center rounded-md border p-0.5">
          <button
            type="button"
            onClick={() => setFilter('actif')}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-medium transition-colors',
              filter === 'actif'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Actives ({categories.filter((c) => !c.archive).length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('archive')}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-medium transition-colors',
              filter === 'archive'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Archivées ({categories.filter((c) => c.archive).length})
          </button>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          + Nouvelle catégorie
        </Button>
      </div>

      <div className="border-border overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
            <tr>
              <th className="w-16 px-3 py-2 text-left">Ordre</th>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Libellé</th>
              <th className="px-3 py-2 text-right">Heures 12m</th>
              <th className="w-24 px-3 py-2 text-center">Actif</th>
              <th className="w-32 px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="text-muted-foreground px-3 py-6 text-center text-sm"
                >
                  {filter === 'actif'
                    ? 'Aucune catégorie active'
                    : 'Aucune catégorie archivée'}
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <tr
                key={c.id}
                className={cn(
                  'border-border/60 border-t',
                  c.archive && 'opacity-60',
                )}
              >
                <td className="px-3 py-2 tabular-nums">{c.ordre}</td>
                <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
                  {c.code}
                </td>
                <td className="px-3 py-2 font-medium">{c.libelle}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {(heuresParCategorie.get(c.id) ?? 0).toFixed(1)} h
                </td>
                <td className="px-3 py-2 text-center">
                  {c.actif ? (
                    <span className="inline-flex h-5 items-center rounded-full bg-emerald-50 px-2 text-[10px] font-semibold tracking-wide text-emerald-700 uppercase">
                      Actif
                    </span>
                  ) : (
                    <span className="text-muted-foreground inline-flex h-5 items-center rounded-full bg-gray-100 px-2 text-[10px] font-semibold tracking-wide uppercase">
                      Inactif
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(c)}
                    disabled={c.archive}
                  >
                    Éditer
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setArchiveTarget(c)}
                    disabled={pendingArchiveId && archivingId === c.id}
                  >
                    {c.archive ? 'Désarchiver' : 'Archiver'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CategorieFormDialog open={showCreate} onOpenChange={setShowCreate} />
      {editing && (
        <CategorieFormDialog
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(undefined)}
          categorie={editing}
        />
      )}

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title={
          archiveTarget?.archive
            ? 'Désarchiver la catégorie'
            : 'Archiver la catégorie'
        }
        description={
          archiveTarget
            ? `Confirmer ${archiveTarget.archive ? 'désarchiver' : 'archiver'} la catégorie "${archiveTarget.libelle}" ?`
            : ''
        }
        confirmText={archiveTarget?.archive ? 'Désarchiver' : 'Archiver'}
        variant={archiveTarget?.archive ? 'default' : 'destructive'}
        onConfirm={handleArchiveConfirm}
        isPending={archivingId !== null}
      />
    </div>
  );
}
