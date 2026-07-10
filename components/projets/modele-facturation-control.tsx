'use client';

import { useState, useTransition } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { updateProjetModeleFacturation } from '@/lib/actions/projets';
import { cn } from '@/lib/utils';

export type ModeleFacturation = 'engagement' | 'echeancier';

interface ModeleFacturationControlProps {
  projetId: string;
  initialModele: ModeleFacturation;
  initialTemplateId: string | null;
  templates: Array<{ id: string; nom: string; is_default: boolean }>;
  canEdit: boolean;
}

const selectClass =
  'border-primary/30 focus:border-primary rounded border bg-white px-1 py-0.5 text-xs outline-none';

/**
 * Badge editable du modele de facturation du projet (engagement vs
 * echeancier) + template d'echeancier assigne. Meme pattern inline que
 * CommissionRateBadge.
 */
export function ModeleFacturationControl({
  projetId,
  initialModele,
  initialTemplateId,
  templates,
  canEdit,
}: ModeleFacturationControlProps) {
  const { refresh } = useRouter();
  const [editing, setEditing] = useState(false);
  const [modele, setModele] = useState<ModeleFacturation>(initialModele);
  const [templateId, setTemplateId] = useState<string>(initialTemplateId ?? '');
  const [isPending, startTransition] = useTransition();

  const defaultTemplate = templates.find((t) => t.is_default);
  const label =
    initialModele === 'engagement'
      ? "À l'engagement"
      : `Échéancier${
          initialTemplateId
            ? ` : ${templates.find((t) => t.id === initialTemplateId)?.nom ?? '?'}`
            : defaultTemplate
              ? ` : ${defaultTemplate.nom}`
              : ''
        }`;

  if (!canEdit) {
    return (
      <span className="text-muted-foreground bg-muted rounded-full px-3 py-1 text-xs font-medium">
        {label}
      </span>
    );
  }

  const cancel = () => {
    setModele(initialModele);
    setTemplateId(initialTemplateId ?? '');
    setEditing(false);
  };

  const save = () => {
    if (
      modele === initialModele &&
      (templateId || null) === initialTemplateId
    ) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const result = await updateProjetModeleFacturation({
        projetId,
        modele,
        echeancierTemplateId:
          modele === 'echeancier' ? templateId || null : null,
      });
      if (!result.success) {
        toast.error(result.error ?? 'Erreur lors de la mise à jour');
        return;
      }
      toast.success('Modèle de facturation mis à jour');
      setEditing(false);
      refresh();
    });
  };

  if (editing) {
    return (
      <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-[var(--primary-bg)] py-0.5 pr-1 pl-3 text-xs font-medium">
        <select
          value={modele}
          onChange={(e) => setModele(e.target.value as ModeleFacturation)}
          disabled={isPending}
          aria-label="Modèle de facturation"
          className={selectClass}
        >
          <option value="echeancier">Échéancier (jalons mensuels)</option>
          <option value="engagement">À l&apos;engagement (OPCO)</option>
        </select>
        {modele === 'echeancier' && (
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            disabled={isPending}
            aria-label="Template d'échéancier"
            className={selectClass}
          >
            <option value="">
              {defaultTemplate
                ? `Défaut (${defaultTemplate.nom})`
                : 'Template par défaut'}
            </option>
            {templates
              .filter((t) => !t.is_default)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nom}
                </option>
              ))}
          </select>
        )}
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          aria-label="Enregistrer"
          className="hover:bg-primary/20 rounded p-0.5 transition-colors disabled:opacity-50"
        >
          <Check className="size-3" />
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={isPending}
          aria-label="Annuler"
          className="text-muted-foreground hover:bg-muted rounded p-0.5 transition-colors disabled:opacity-50"
        >
          <X className="size-3" />
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        'text-muted-foreground bg-muted group inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
        'hover:bg-muted/70',
      )}
      aria-label="Modifier le modèle de facturation"
    >
      {label}
      <Pencil className="size-3 opacity-50 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
