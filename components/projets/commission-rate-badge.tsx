'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { updateProjetTauxCommission } from '@/lib/actions/projets';
import { cn } from '@/lib/utils';

interface CommissionRateBadgeProps {
  projetId: string;
  initialValue: number;
  canEdit: boolean;
}

export function CommissionRateBadge({
  projetId,
  initialValue,
  canEdit,
}: CommissionRateBadgeProps) {
  const { refresh } = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(initialValue));
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // oxlint-disable-next-line react-doctor/no-event-handler
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (!canEdit) {
    return (
      <span className="text-primary rounded-full bg-[var(--primary-bg)] px-3 py-1 text-xs font-medium">
        Commission : {initialValue}%
      </span>
    );
  }

  const cancel = () => {
    setValue(String(initialValue));
    setEditing(false);
  };

  const save = () => {
    const parsed = parseFloat(value.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      toast.error('Le taux doit être entre 0 et 100');
      return;
    }
    if (parsed === initialValue) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const result = await updateProjetTauxCommission(projetId, parsed);
      if (!result.success) {
        toast.error(result.error ?? 'Erreur lors de la mise à jour');
        return;
      }
      toast.success(`Taux de commission mis à jour : ${parsed}%`);
      setEditing(false);
      refresh();
    });
  };

  if (editing) {
    return (
      <span className="text-primary inline-flex items-center gap-1 rounded-full bg-[var(--primary-bg)] py-0.5 pr-1 pl-3 text-xs font-medium">
        Commission :
        <input
          ref={inputRef}
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={value}
          aria-label="Taux de commission en pourcentage"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') cancel();
          }}
          disabled={isPending}
          className="border-primary/30 focus:border-primary w-14 rounded border bg-white px-1 text-right text-xs tabular-nums outline-none"
        />
        %
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
        'text-primary group inline-flex items-center gap-1.5 rounded-full bg-[var(--primary-bg)] px-3 py-1 text-xs font-medium transition-colors',
        'hover:bg-[var(--primary-bg-strong)]',
      )}
      aria-label="Modifier le taux de commission"
    >
      Commission : {initialValue}%
      <Pencil className="size-3 opacity-50 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
