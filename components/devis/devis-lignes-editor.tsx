'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { addLigne, updateLigne, deleteLigne } from '@/lib/actions/devis';
import { useRouter } from 'next/navigation';
import type { DevisLigneRow } from '@/lib/queries/devis';

interface DraftLigne {
  id: string; // 'new-*' or existing UUID
  libelle: string;
  description: string;
  quantite: string;
  prix_unitaire_ht: string;
  taux_tva: string;
  isNew: boolean;
  isDirty: boolean;
}

function fromRow(row: DevisLigneRow): DraftLigne {
  return {
    id: row.id,
    libelle: row.libelle,
    description: row.description ?? '',
    quantite: String(row.quantite),
    prix_unitaire_ht: String(row.prix_unitaire_ht),
    taux_tva: String(row.taux_tva),
    isNew: false,
    isDirty: false,
  };
}

function emptyDraft(): DraftLigne {
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    libelle: '',
    description: '',
    quantite: '1',
    prix_unitaire_ht: '',
    taux_tva: '20',
    isNew: true,
    isDirty: false,
  };
}

interface DevisLignesEditorProps {
  devisId: string;
  lignes: DevisLigneRow[];
}

export function DevisLignesEditor({ devisId, lignes }: DevisLignesEditorProps) {
  const { refresh } = useRouter();
  const [rows, setRows] = useState<DraftLigne[]>(() => lignes.map(fromRow));
  const [pending, start] = useTransition();

  function addRow() {
    setRows((prev) => [...prev, emptyDraft()]);
  }

  function removeRow(id: string, isNew: boolean) {
    if (isNew) {
      setRows((prev) => prev.filter((r) => r.id !== id));
      return;
    }
    start(async () => {
      const res = await deleteLigne(id);
      if (res.success) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function updateRow(id: string, patch: Partial<DraftLigne>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch, isDirty: true } : r)),
    );
  }

  function saveRow(row: DraftLigne) {
    const ligneData = {
      libelle: row.libelle.trim(),
      description: row.description.trim() || null,
      quantite: Number(row.quantite.replace(',', '.')),
      prix_unitaire_ht: Number(row.prix_unitaire_ht.replace(',', '.')),
      taux_tva: Number(row.taux_tva.replace(',', '.')),
    };

    if (
      !ligneData.libelle ||
      ligneData.quantite <= 0 ||
      ligneData.prix_unitaire_ht < 0
    ) {
      toast.error('Libellé requis, quantité > 0, PU HT >= 0.');
      return;
    }

    start(async () => {
      if (row.isNew) {
        const res = await addLigne(devisId, ligneData);
        if (res.success) {
          setRows((prev) =>
            prev.map((r) =>
              r.id === row.id
                ? { ...r, id: res.id, isNew: false, isDirty: false }
                : r,
            ),
          );
          refresh();
        } else {
          toast.error(res.error);
        }
      } else {
        const res = await updateLigne(row.id, ligneData);
        if (res.success) {
          setRows((prev) =>
            prev.map((r) => (r.id === row.id ? { ...r, isDirty: false } : r)),
          );
          refresh();
        } else {
          toast.error(res.error);
        }
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Lignes</span>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={addRow}
          disabled={pending}
        >
          <Plus className="mr-1 size-3.5" />
          Ajouter une ligne
        </Button>
      </div>

      {rows.length === 0 && (
        <p className="text-muted-foreground py-4 text-center text-sm">
          Aucune ligne. Cliquez &quot;Ajouter&quot; pour commencer.
        </p>
      )}

      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="bg-muted/30 grid grid-cols-12 gap-2 rounded-md border p-3"
          >
            <div className="col-span-12 sm:col-span-5">
              <label className="text-muted-foreground mb-1 block text-xs font-medium">
                Libellé *
              </label>
              <Input
                placeholder="Libellé *"
                value={row.libelle}
                onChange={(e) => updateRow(row.id, { libelle: e.target.value })}
              />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <label className="text-muted-foreground mb-1 block text-xs font-medium">
                Qté
              </label>
              <Input
                placeholder="Qté"
                value={row.quantite}
                onChange={(e) =>
                  updateRow(row.id, { quantite: e.target.value })
                }
              />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <label className="text-muted-foreground mb-1 block text-xs font-medium">
                PU HT (€)
              </label>
              <Input
                placeholder="PU HT (€)"
                value={row.prix_unitaire_ht}
                onChange={(e) =>
                  updateRow(row.id, { prix_unitaire_ht: e.target.value })
                }
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-muted-foreground mb-1 block text-xs font-medium">
                TVA%
              </label>
              <Input
                placeholder="TVA%"
                value={row.taux_tva}
                onChange={(e) =>
                  updateRow(row.id, { taux_tva: e.target.value })
                }
              />
            </div>
            <div className="col-span-2 flex items-center justify-end gap-1 sm:pt-6">
              {(row.isNew || row.isDirty) && (
                <button
                  type="button"
                  onClick={() => saveRow(row)}
                  disabled={pending}
                  title="Enregistrer"
                  className="text-muted-foreground hover:text-primary disabled:opacity-30"
                >
                  <Save className="size-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => removeRow(row.id, row.isNew)}
                disabled={pending}
                title="Supprimer"
                className="text-muted-foreground hover:text-destructive disabled:opacity-30"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            <div className="col-span-12">
              <label className="text-muted-foreground mb-1 block text-xs font-medium">
                Description (optionnel)
              </label>
              <Textarea
                rows={1}
                placeholder="Description (optionnel)"
                value={row.description}
                onChange={(e) =>
                  updateRow(row.id, { description: e.target.value })
                }
                className="min-h-9 resize-none"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
