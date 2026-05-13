'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Calendar, MousePointer, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';
import { parseJalons, validateJalons, type Jalon } from '@/lib/echeancier/calc';
import {
  setProjetEcheancierOverride,
  setProjetEcheancierTemplate,
} from '@/lib/actions/echeanciers';

interface ProjetEcheancierSectionProps {
  projetId: string;
  templates: Array<{
    id: string;
    nom: string;
    description: string | null;
    jalons: unknown;
    is_default: boolean;
  }>;
  currentTemplateId: string | null;
  currentOverride: unknown;
  isAdmin: boolean;
}

export function ProjetEcheancierSection({
  projetId,
  templates,
  currentTemplateId,
  currentOverride,
  isAdmin,
}: ProjetEcheancierSectionProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const overrideJalons = useMemo(
    () => parseJalons(currentOverride),
    [currentOverride],
  );
  const hasOverride = overrideJalons.length > 0;

  const currentTemplate = currentTemplateId
    ? templates.find((t) => t.id === currentTemplateId)
    : templates.find((t) => t.is_default);

  // Jalons effectivement applicables (override > template > default)
  const effectiveJalons: Jalon[] = hasOverride
    ? overrideJalons
    : currentTemplate
      ? parseJalons(currentTemplate.jalons)
      : [];

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="text-primary h-4 w-4" />
          <h3 className="text-sm font-semibold">Échéancier de facturation</h3>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Personnaliser
          </Button>
        )}
      </div>

      <div className="mb-4 flex items-center gap-2">
        {hasOverride ? (
          <StatusBadge label="Override custom" color="purple" />
        ) : (
          <>
            <StatusBadge label={currentTemplate?.nom ?? 'Aucun'} color="blue" />
            {!currentTemplateId && currentTemplate && (
              <span className="text-muted-foreground text-xs">
                (par défaut)
              </span>
            )}
          </>
        )}
      </div>

      {effectiveJalons.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Aucun échéancier configuré. Le projet ne génèrera pas
          d&apos;échéances.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            {effectiveJalons.length} jalon
            {effectiveJalons.length > 1 ? 's' : ''}, total{' '}
            <span className="text-foreground tabular-nums">
              {formatTotalAsFraction(
                effectiveJalons.reduce((s, j) => s + j.quote_part, 0),
              )}
            </span>{' '}
            du NPEC × taux commission.
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {effectiveJalons.map((j) => (
              <div
                key={j.mois_relatif}
                className="border-border rounded border px-2 py-1.5 text-center text-xs"
              >
                <div className="text-muted-foreground font-mono">
                  M+{j.mois_relatif}
                </div>
                <div className="text-foreground font-semibold tabular-nums">
                  {formatQuotePartAsFraction(j.quote_part)}
                </div>
                {j.label ? (
                  <div className="text-muted-foreground mt-0.5 truncate text-[10px]">
                    {j.label}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {open && (
        <EcheancierDialog
          open={open}
          onOpenChange={setOpen}
          projetId={projetId}
          templates={templates}
          currentTemplateId={currentTemplateId}
          currentOverride={overrideJalons}
          onSaved={() => router.refresh()}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Placeholder pour les projets en facturation manuelle
// ---------------------------------------------------------------------------

export function ProjetEcheancierManualPlaceholder() {
  return (
    <Card className="p-6">
      <div className="mb-3 flex items-center gap-2">
        <MousePointer className="h-4 w-4 text-orange-600" />
        <h3 className="text-sm font-semibold">Échéancier de facturation</h3>
      </div>
      <p className="text-muted-foreground text-sm">
        Ce projet est en facturation manuelle. Allez dans Facturation, onglet
        Manuel, pour facturer les engagements ou règlements OPCO.
      </p>
      <div className="mt-3">
        <Link
          href="/facturation?tab=manuel"
          className="text-primary text-xs font-medium underline-offset-2 hover:underline"
        >
          Ouvrir l&apos;onglet Manuel
        </Link>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Dialog : choix template ou override custom
// ---------------------------------------------------------------------------

function EcheancierDialog({
  open,
  onOpenChange,
  projetId,
  templates,
  currentTemplateId,
  currentOverride,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projetId: string;
  templates: ProjetEcheancierSectionProps['templates'];
  currentTemplateId: string | null;
  currentOverride: Jalon[];
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<'template' | 'override'>(
    currentOverride.length > 0 ? 'override' : 'template',
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    currentTemplateId,
  );
  const [customJalons, setCustomJalons] = useState<Jalon[]>(
    currentOverride.length > 0
      ? currentOverride
      : currentTemplateId
        ? parseJalons(templates.find((t) => t.id === currentTemplateId)?.jalons)
        : parseJalons(templates.find((t) => t.is_default)?.jalons),
  );
  const [pending, startTransition] = useTransition();

  const validation = validateJalons(customJalons);

  function addJalon() {
    const maxMois = customJalons.reduce(
      (m, j) => Math.max(m, j.mois_relatif),
      0,
    );
    setCustomJalons([
      ...customJalons,
      { mois_relatif: maxMois + 1, quote_part: 0.0833 },
    ]);
  }

  function updateJalon(idx: number, patch: Partial<Jalon>) {
    setCustomJalons(
      customJalons.map((j, i) => (i === idx ? { ...j, ...patch } : j)),
    );
  }

  function removeJalon(idx: number) {
    setCustomJalons(customJalons.filter((_, i) => i !== idx));
  }

  function handleSave() {
    startTransition(async () => {
      if (mode === 'template') {
        const r = await setProjetEcheancierTemplate({
          projetId,
          templateId: selectedTemplateId,
        });
        if (r.success) {
          toast.success('Template appliqué');
          onSaved();
          onOpenChange(false);
        } else {
          toast.error(r.error ?? 'Erreur');
        }
        return;
      }

      // Override custom
      const r = await setProjetEcheancierOverride({
        projetId,
        jalons: customJalons,
      });
      if (r.success) {
        toast.success('Échéancier custom appliqué');
        if (r.warnings && r.warnings.length > 0) {
          for (const w of r.warnings) toast.warning(w);
        }
        onSaved();
        onOpenChange(false);
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Échéancier du projet</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tabs mode */}
          <div className="border-border inline-flex items-center rounded-md border bg-white p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode('template')}
              className={cn(
                'cursor-pointer rounded px-3 py-1 font-medium transition-colors',
                mode === 'template'
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Template
            </button>
            <button
              type="button"
              onClick={() => setMode('override')}
              className={cn(
                'cursor-pointer rounded px-3 py-1 font-medium transition-colors',
                mode === 'override'
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Override custom
            </button>
          </div>

          {mode === 'template' ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setSelectedTemplateId(null)}
                className={cn(
                  'border-border w-full cursor-pointer rounded border p-3 text-left text-sm transition-colors',
                  selectedTemplateId === null
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-muted/30',
                )}
              >
                <div className="font-semibold">Défaut global</div>
                <div className="text-muted-foreground text-xs">
                  Utilise le template marqué comme défaut.
                </div>
              </button>
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTemplateId(t.id)}
                  className={cn(
                    'border-border w-full cursor-pointer rounded border p-3 text-left text-sm transition-colors',
                    selectedTemplateId === t.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/30',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{t.nom}</span>
                    {t.is_default && (
                      <span className="text-muted-foreground text-xs">
                        (défaut)
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      {t.description}
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">
                Définis tes jalons. Total typique = 100% du NPEC × taux
                commission.
              </p>
              <div className="space-y-1.5">
                {customJalons.map((j, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-muted-foreground w-12 text-xs">
                      M+
                    </span>
                    <Input
                      type="number"
                      min={1}
                      max={48}
                      value={j.mois_relatif}
                      onChange={(e) =>
                        updateJalon(idx, {
                          mois_relatif: Number(e.target.value),
                        })
                      }
                      className="w-20"
                      aria-label="Mois relatif"
                    />
                    <Input
                      type="number"
                      step={0.5}
                      min={0.5}
                      max={48}
                      value={Number((j.quote_part * 12).toFixed(2))}
                      onChange={(e) =>
                        updateJalon(idx, {
                          quote_part: Number(e.target.value) / 12,
                        })
                      }
                      className="w-20"
                      aria-label="Quote-part (douzièmes)"
                    />
                    <span className="text-muted-foreground text-xs">/12</span>
                    <Input
                      type="text"
                      placeholder="Label (optionnel)"
                      value={j.label ?? ''}
                      onChange={(e) =>
                        updateJalon(idx, { label: e.target.value || undefined })
                      }
                      className="flex-1"
                      aria-label="Label du jalon"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeJalon(idx)}
                      aria-label="Supprimer ce jalon"
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
              <div className="text-muted-foreground border-border mt-3 rounded border p-2 text-xs">
                Total :{' '}
                <span className="text-foreground font-semibold tabular-nums">
                  {formatTotalAsFraction(validation.total)}
                </span>
                {validation.warnings.length > 0 && (
                  <div className="mt-1 text-[var(--warning)]">
                    {validation.warnings[0]}
                  </div>
                )}
                {validation.errors.length > 0 && (
                  <div className="mt-1 text-[var(--destructive)]">
                    {validation.errors[0]}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Annuler
          </Button>
          <Button
            onClick={handleSave}
            disabled={pending || (mode === 'override' && !validation.ok)}
          >
            {pending ? 'Enregistrement...' : 'Appliquer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Helpers d'affichage : convertit quote_part decimal -> fraction sur 12
// ---------------------------------------------------------------------------

/**
 * Affiche une quote_part en fraction /12 :
 * - 0.25     -> "3/12"
 * - 0.0833   -> "1/12" (arrondi a l'entier le plus proche si tolerance 0.05)
 * - 0.1      -> "1.2/12" (1 decimale sinon)
 */
function formatQuotePartAsFraction(qp: number): string {
  const twelfths = qp * 12;
  if (Math.abs(twelfths - Math.round(twelfths)) < 0.05) {
    return `${Math.round(twelfths)}/12`;
  }
  return `${twelfths.toFixed(1)}/12`;
}

/** Pareil pour le total (peut depasser 12/12 si jalons custom) */
function formatTotalAsFraction(total: number): string {
  const twelfths = total * 12;
  if (Math.abs(twelfths - Math.round(twelfths)) < 0.05) {
    return `${Math.round(twelfths)}/12`;
  }
  return `${twelfths.toFixed(1)}/12`;
}
