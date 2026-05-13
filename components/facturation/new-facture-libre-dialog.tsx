'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Trash2, Loader2 } from 'lucide-react';
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
import { createFreeBrouillon } from '@/lib/actions/factures';
import { matchesSearch } from '@/lib/utils/search';
import { cn } from '@/lib/utils';

export interface FreeFactureClientOption {
  id: string;
  trigramme: string;
  raison_sociale: string;
}

interface NewFactureLibreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: FreeFactureClientOption[];
}

interface DraftLigne {
  id: string;
  description: string;
  montantHt: string;
}

function emptyLigne(): DraftLigne {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: '',
    montantHt: '',
  };
}

export function NewFactureLibreDialog({
  open,
  onOpenChange,
  clients,
}: NewFactureLibreDialogProps) {
  const router = useRouter();
  const [clientId, setClientId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [lignes, setLignes] = useState<DraftLigne[]>([emptyLigne()]);
  const [isSubmitting, startSubmit] = useTransition();

  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients;
    return clients.filter((c) =>
      matchesSearch(`${c.trigramme} ${c.raison_sociale}`, search),
    );
  }, [clients, search]);

  const totalHt = useMemo(() => {
    return lignes.reduce((s, l) => {
      const n = Number(l.montantHt.replace(',', '.'));
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [lignes]);

  const totalTtc = totalHt * 1.2;
  const selectedClient = clients.find((c) => c.id === clientId);

  const canSubmit =
    !!clientId &&
    lignes.length > 0 &&
    lignes.every(
      (l) =>
        l.description.trim().length > 0 &&
        Number(l.montantHt.replace(',', '.')) > 0,
    );

  function reset() {
    setClientId('');
    setSearch('');
    setLignes([emptyLigne()]);
  }

  function handleOpenChange(next: boolean) {
    if (isSubmitting) return;
    onOpenChange(next);
    if (!next) reset();
  }

  function addLigne() {
    setLignes((prev) => [...prev, emptyLigne()]);
  }

  function removeLigne(id: string) {
    setLignes((prev) =>
      prev.length > 1 ? prev.filter((l) => l.id !== id) : prev,
    );
  }

  function updateLigne(id: string, patch: Partial<DraftLigne>) {
    setLignes((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
  }

  function handleSubmit() {
    if (!canSubmit || !clientId) return;
    startSubmit(async () => {
      const result = await createFreeBrouillon({
        clientId,
        lignes: lignes.map((l) => ({
          description: l.description.trim(),
          montantHt: Number(l.montantHt.replace(',', '.')),
        })),
      });
      if (result.success) {
        toast.success(
          'Brouillon de facture libre créé. À vérifier puis envoyer dans l’onglet Brouillons.',
        );
        onOpenChange(false);
        reset();
        router.refresh();
      } else {
        toast.error(result.error ?? 'Erreur lors de la création du brouillon');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nouvelle facture libre</DialogTitle>
          <p className="text-muted-foreground text-xs">
            Facture rattachée à un client, sans projet ni contrats (conseil,
            audit, prestation ponctuelle...).
          </p>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-2">
          {/* Step 1 : choix client */}
          <div className="space-y-2">
            <Label htmlFor="search-client">Client</Label>
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 h-4 w-4" />
              <Input
                id="search-client"
                placeholder="Rechercher par trigramme ou raison sociale..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-md border">
              {filteredClients.length === 0 ? (
                <p className="text-muted-foreground p-4 text-center text-xs">
                  Aucun client trouvé.
                </p>
              ) : (
                <ul className="divide-y">
                  {filteredClients.map((c) => {
                    const isSelected = c.id === clientId;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setClientId(c.id)}
                          className={cn(
                            'hover:bg-muted/40 flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
                            isSelected && 'bg-primary/10 hover:bg-primary/15',
                          )}
                        >
                          <span className="font-mono text-xs font-semibold">
                            {c.trigramme}
                          </span>
                          <span className="text-muted-foreground truncate">
                            {c.raison_sociale}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Step 2 : lignes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Lignes de facture</Label>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={addLigne}
                disabled={isSubmitting}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Ajouter une ligne
              </Button>
            </div>
            <div className="space-y-2">
              {lignes.map((l, idx) => (
                <div
                  key={l.id}
                  className="border-border bg-muted/20 flex items-start gap-2 rounded-md border p-2"
                >
                  <div className="flex-1 space-y-1.5">
                    <Input
                      placeholder={`Description ligne ${idx + 1}`}
                      value={l.description}
                      onChange={(e) =>
                        updateLigne(l.id, { description: e.target.value })
                      }
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="w-32">
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="Montant HT"
                      value={l.montantHt}
                      onChange={(e) =>
                        updateLigne(l.id, { montantHt: e.target.value })
                      }
                      disabled={isSubmitting}
                      className="text-right tabular-nums"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeLigne(l.id)}
                    disabled={lignes.length <= 1 || isSubmitting}
                    aria-label="Supprimer la ligne"
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Récap */}
          <div className="border-border bg-muted/30 space-y-1 rounded-md border p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Client</span>
              <span className="font-medium">
                {selectedClient
                  ? `${selectedClient.trigramme} - ${selectedClient.raison_sociale}`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total HT</span>
              <span className="font-mono tabular-nums">
                {totalHt.toFixed(2)} €
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">TVA 20%</span>
              <span className="font-mono tabular-nums">
                {(totalTtc - totalHt).toFixed(2)} €
              </span>
            </div>
            <div className="flex justify-between border-t pt-1 text-base font-semibold">
              <span>Total TTC</span>
              <span className="font-mono tabular-nums">
                {totalTtc.toFixed(2)} €
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Création...
              </>
            ) : (
              'Préparer le brouillon'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
