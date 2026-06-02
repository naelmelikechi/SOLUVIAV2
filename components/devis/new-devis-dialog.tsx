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
import { createDevis } from '@/lib/actions/devis';
import { matchesSearch } from '@/lib/utils/search';
import { cn } from '@/lib/utils';

export interface SocieteOption {
  id: string;
  code: string;
  raison_sociale: string;
  est_defaut: boolean | null;
}

export interface ClientOption {
  id: string;
  trigramme: string;
  raison_sociale: string;
}

interface DraftLigne {
  id: string;
  libelle: string;
  description: string;
  quantite: string;
  prix_unitaire_ht: string;
  taux_tva: string;
}

function emptyLigne(): DraftLigne {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    libelle: '',
    description: '',
    quantite: '1',
    prix_unitaire_ht: '',
    taux_tva: '20',
  };
}

interface NewDevisDialogProps {
  societes: SocieteOption[];
  clients?: ClientOption[];
}

const EMPTY_CLIENTS: ClientOption[] = [];

// oxlint-disable-next-line react-doctor/no-giant-component
export function NewDevisDialog({
  societes,
  clients = EMPTY_CLIENTS,
  // oxlint-disable-next-line react-doctor/prefer-useReducer
}: NewDevisDialogProps) {
  const { push } = useRouter();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState('');
  const [search, setSearch] = useState('');
  const [societeId, setSocieteId] = useState<string>(
    () => societes.find((s) => s.est_defaut)?.id ?? societes[0]?.id ?? '',
  );
  const [objet, setObjet] = useState('');
  const [dateValidite, setDateValidite] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().slice(0, 10);
  });
  const [lignes, setLignes] = useState<DraftLigne[]>([emptyLigne()]);
  const [pending, start] = useTransition();

  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients;
    return clients.filter((c) =>
      matchesSearch(`${c.trigramme} ${c.raison_sociale}`, search),
    );
  }, [clients, search]);

  const canSubmit =
    !!clientId &&
    !!societeId &&
    objet.trim().length > 0 &&
    lignes.length > 0 &&
    lignes.every(
      (l) =>
        l.libelle.trim().length > 0 &&
        Number(l.quantite.replace(',', '.')) > 0 &&
        Number(l.prix_unitaire_ht.replace(',', '.')) >= 0,
    );

  function reset() {
    setClientId('');
    setSearch('');
    setObjet('');
    setLignes([emptyLigne()]);
    const d = new Date();
    d.setDate(d.getDate() + 90);
    setDateValidite(d.toISOString().slice(0, 10));
    setSocieteId(
      societes.find((s) => s.est_defaut)?.id ?? societes[0]?.id ?? '',
    );
  }

  function handleOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
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
    if (!canSubmit) return;
    start(async () => {
      const result = await createDevis({
        client_id: clientId,
        societe_emettrice_id: societeId,
        objet: objet.trim(),
        date_validite: dateValidite,
        lignes: lignes.map((l) => ({
          libelle: l.libelle.trim(),
          description: l.description.trim() || null,
          quantite: Number(l.quantite.replace(',', '.')),
          prix_unitaire_ht: Number(l.prix_unitaire_ht.replace(',', '.')),
          taux_tva: Number(l.taux_tva.replace(',', '.')),
        })),
      });
      if (result.success) {
        toast.success('Devis brouillon créé.');
        setOpen(false);
        reset();
        push(`/devis/${result.id}`);
      } else {
        toast.error(result.error ?? 'Erreur lors de la création du devis');
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 size-4" />
        Nouveau devis
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nouveau devis</DialogTitle>
            <p className="text-muted-foreground text-xs">
              Créez un brouillon de devis. Vous pourrez l&apos;éditer avant
              envoi.
            </p>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-2">
            {/* Societe emettrice */}
            {societes.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="devis-societe">Société émettrice</Label>
                <select
                  id="devis-societe"
                  value={societeId}
                  onChange={(e) => setSocieteId(e.target.value)}
                  className="bg-background w-full rounded-md border px-3 py-2 text-sm"
                >
                  {societes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} - {s.raison_sociale}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {societes.length === 1 && (
              <p className="text-muted-foreground text-xs">
                Émis depuis : <strong>{societes[0]!.raison_sociale}</strong>
              </p>
            )}

            {/* Objet */}
            <div className="space-y-2">
              <Label htmlFor="devis-objet">Objet *</Label>
              <Input
                id="devis-objet"
                value={objet}
                onChange={(e) => setObjet(e.target.value)}
                placeholder="Objet du devis"
              />
            </div>

            {/* Date validite */}
            <div className="space-y-2">
              <Label htmlFor="devis-validite">Valide jusqu&apos;au</Label>
              <Input
                id="devis-validite"
                type="date"
                value={dateValidite}
                onChange={(e) => setDateValidite(e.target.value)}
              />
            </div>

            {/* Client */}
            <div className="space-y-2">
              <Label htmlFor="devis-search-client">Client *</Label>
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" />
                <Input
                  id="devis-search-client"
                  placeholder="Rechercher par trigramme ou raison sociale..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <div className="max-h-40 overflow-y-auto rounded-md border">
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

            {/* Lignes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Lignes *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={addLigne}
                  disabled={pending}
                >
                  <Plus className="mr-1 size-3.5" />
                  Ajouter
                </Button>
              </div>

              <div className="space-y-2">
                {lignes.map((l) => (
                  <div
                    key={l.id}
                    className="bg-muted/30 grid grid-cols-12 gap-2 rounded-md border p-3"
                  >
                    <div className="col-span-12 sm:col-span-5">
                      <Input
                        placeholder="Libellé *"
                        value={l.libelle}
                        onChange={(e) =>
                          updateLigne(l.id, { libelle: e.target.value })
                        }
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <Input
                        placeholder="Qté"
                        value={l.quantite}
                        onChange={(e) =>
                          updateLigne(l.id, { quantite: e.target.value })
                        }
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-3">
                      <Input
                        placeholder="PU HT (€)"
                        value={l.prix_unitaire_ht}
                        onChange={(e) =>
                          updateLigne(l.id, {
                            prix_unitaire_ht: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-1">
                      <Input
                        placeholder="TVA%"
                        value={l.taux_tva}
                        onChange={(e) =>
                          updateLigne(l.id, { taux_tva: e.target.value })
                        }
                      />
                    </div>
                    <div className="col-span-1 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => removeLigne(l.id)}
                        disabled={lignes.length <= 1}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="col-span-12">
                      <Input
                        placeholder="Description (optionnel)"
                        value={l.description}
                        onChange={(e) =>
                          updateLigne(l.id, { description: e.target.value })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit || pending}>
              {pending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Création…
                </>
              ) : (
                'Créer le devis'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
