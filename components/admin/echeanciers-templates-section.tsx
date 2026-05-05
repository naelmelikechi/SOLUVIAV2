'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Pencil, Plus, Star, Trash2, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { parseJalons, validateJalons, type Jalon } from '@/lib/echeancier/calc';
import {
  archiveEcheancierTemplate,
  createEcheancierTemplate,
  setEcheancierTemplateDefault,
  updateEcheancierTemplate,
} from '@/lib/actions/echeanciers';

interface Template {
  id: string;
  nom: string;
  description: string | null;
  jalons: unknown;
  is_default: boolean;
}

interface Props {
  templates: Template[];
}

function formatJalon(qp: number): string {
  const t = qp * 12;
  if (Math.abs(t - Math.round(t)) < 0.05) return `${Math.round(t)}/12`;
  return `${t.toFixed(1)}/12`;
}

export function EcheanciersTemplatesSection({ templates }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const [pending, startTransition] = useTransition();

  function setDefault(id: string) {
    startTransition(async () => {
      const r = await setEcheancierTemplateDefault(id);
      if (r.success) {
        toast.success('Template défini par défaut');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  function archive(id: string) {
    startTransition(async () => {
      const r = await archiveEcheancierTemplate(id, true);
      if (r.success) {
        toast.success('Template archivé');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Templates d&apos;échéancier réutilisables. Le template marqué par
            défaut s&apos;applique aux projets sans configuration explicite.
          </p>
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Nouveau template
          </Button>
        </div>

        {templates.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            Aucun template.
          </p>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => {
              const jalons = parseJalons(t.jalons);
              const total = jalons.reduce((s, j) => s + j.quote_part, 0);
              const totalLabel = formatJalon(total);
              return (
                <Card key={t.id} className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="text-primary h-4 w-4" />
                        <span className="text-sm font-semibold">{t.nom}</span>
                        {t.is_default && (
                          <StatusBadge label="Par défaut" color="green" />
                        )}
                      </div>
                      {t.description ? (
                        <p className="text-muted-foreground mt-1 text-xs">
                          {t.description}
                        </p>
                      ) : null}
                      <p className="text-muted-foreground mt-1 text-xs">
                        {jalons.length} jalons · Total {totalLabel}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {!t.is_default && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDefault(t.id)}
                          disabled={pending}
                          title="Définir par défaut"
                        >
                          <Star className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(t)}
                        disabled={pending}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {!t.is_default && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => archive(t.id)}
                          disabled={pending}
                          title="Archiver"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 md:grid-cols-12">
                    {jalons.map((j) => (
                      <div
                        key={j.mois_relatif}
                        className="border-border rounded border px-1.5 py-1 text-center text-[10px]"
                      >
                        <div className="text-muted-foreground font-mono">
                          M+{j.mois_relatif}
                        </div>
                        <div className="text-foreground font-semibold tabular-nums">
                          {formatJalon(j.quote_part)}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <TemplateDialog
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Dialog : create / edit template
// ---------------------------------------------------------------------------

function TemplateDialog({
  template,
  onClose,
}: {
  template: Template | null; // null = create
  onClose: () => void;
}) {
  const router = useRouter();
  const [nom, setNom] = useState(template?.nom ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [jalons, setJalons] = useState<Jalon[]>(parseJalons(template?.jalons));
  const [pending, startTransition] = useTransition();

  const validation = validateJalons(jalons);

  function addJalon() {
    const max = jalons.reduce((m, j) => Math.max(m, j.mois_relatif), 0);
    setJalons([...jalons, { mois_relatif: max + 1, quote_part: 0.0833 }]);
  }

  function update(idx: number, patch: Partial<Jalon>) {
    setJalons(jalons.map((j, i) => (i === idx ? { ...j, ...patch } : j)));
  }

  function remove(idx: number) {
    setJalons(jalons.filter((_, i) => i !== idx));
  }

  function save() {
    if (!nom.trim()) {
      toast.error('Nom requis');
      return;
    }
    startTransition(async () => {
      if (template) {
        const r = await updateEcheancierTemplate({
          id: template.id,
          nom,
          description: description || null,
          jalons,
        });
        if (r.success) {
          toast.success('Template mis à jour');
          onClose();
          router.refresh();
        } else {
          toast.error(r.error ?? 'Erreur');
        }
      } else {
        const r = await createEcheancierTemplate({
          nom,
          description: description || null,
          jalons,
        });
        if (r.success) {
          toast.success('Template créé');
          onClose();
          router.refresh();
        } else {
          toast.error(r.error ?? 'Erreur');
        }
      }
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {template ? 'Éditer le template' : 'Nouveau template'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nom</label>
            <Input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex: Trimestriel 25%"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Description optionnelle"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Jalons</label>
            <div className="space-y-1.5">
              {jalons.map((j, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-muted-foreground w-12 text-xs">M+</span>
                  <Input
                    type="number"
                    min={1}
                    max={48}
                    value={j.mois_relatif}
                    onChange={(e) =>
                      update(idx, { mois_relatif: Number(e.target.value) })
                    }
                    className="w-20"
                  />
                  <Input
                    type="number"
                    step={0.5}
                    min={0.5}
                    max={48}
                    value={Number((j.quote_part * 12).toFixed(2))}
                    onChange={(e) =>
                      update(idx, { quote_part: Number(e.target.value) / 12 })
                    }
                    className="w-20"
                  />
                  <span className="text-muted-foreground text-xs">/12</span>
                  <Input
                    type="text"
                    placeholder="Label (optionnel)"
                    value={j.label ?? ''}
                    onChange={(e) =>
                      update(idx, { label: e.target.value || undefined })
                    }
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addJalon}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Ajouter un jalon
              </Button>
            </div>
            <div
              className={cn(
                'border-border mt-2 rounded border p-2 text-xs',
                validation.errors.length > 0 && 'border-[var(--destructive)]',
              )}
            >
              <span className="text-muted-foreground">Total : </span>
              <span className="text-foreground font-semibold tabular-nums">
                {formatJalon(validation.total)}
              </span>
              {validation.warnings[0] && (
                <div className="mt-1 text-[var(--warning)]">
                  {validation.warnings[0]}
                </div>
              )}
              {validation.errors[0] && (
                <div className="mt-1 text-[var(--destructive)]">
                  {validation.errors[0]}
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
          <Button
            onClick={save}
            disabled={pending || !validation.ok || !nom.trim()}
          >
            {pending ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
