'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, MousePointer, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { updateProjetBillingMode } from '@/lib/actions/projets';
import { cn } from '@/lib/utils';

type BillingMode = 'auto' | 'manual';

interface BillingModeBadgeProps {
  projetId: string;
  billingMode: BillingMode;
  canEdit: boolean;
}

const AUTO_LABEL = 'Mode auto';
const MANUAL_LABEL = 'Mode manuel';

const AUTO_DESCRIPTION =
  'Échéancier mensuel généré automatiquement. Tu coches les échéances à facturer chaque mois.';
const MANUAL_DESCRIPTION =
  "Pas d'échéancier auto. Tu factures à la demande sur les engagements ou règlements OPCO.";

function badgeClasses(mode: BillingMode): string {
  if (mode === 'manual') {
    return 'bg-orange-100 text-orange-800 hover:bg-orange-200';
  }
  return 'bg-gray-100 text-gray-700 hover:bg-gray-200';
}

function StaticBadge({ mode }: { mode: BillingMode }) {
  const Icon = mode === 'manual' ? MousePointer : Calendar;
  const label = mode === 'manual' ? MANUAL_LABEL : AUTO_LABEL;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
        mode === 'manual'
          ? 'bg-orange-100 text-orange-800'
          : 'bg-gray-100 text-gray-700',
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

export function BillingModeBadge({
  projetId,
  billingMode,
  canEdit,
}: BillingModeBadgeProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!canEdit) {
    return <StaticBadge mode={billingMode} />;
  }

  const Icon = billingMode === 'manual' ? MousePointer : Calendar;
  const label = billingMode === 'manual' ? MANUAL_LABEL : AUTO_LABEL;

  const handleSelect = (next: BillingMode) => {
    if (next === billingMode) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const result = await updateProjetBillingMode(projetId, next);
      if (!result.success) {
        toast.error(result.error ?? 'Erreur lors de la mise à jour');
        return;
      }
      toast.success(
        next === 'manual'
          ? 'Projet passé en facturation manuelle'
          : 'Projet passé en facturation auto',
      );
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
          badgeClasses(billingMode),
        )}
        aria-label="Modifier le mode de facturation"
        disabled={isPending}
      >
        <Icon className="h-3 w-3" />
        {label}
        <Pencil className="h-3 w-3 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Mode de facturation
          </p>
          <ModeOption
            mode="auto"
            current={billingMode}
            disabled={isPending}
            onSelect={handleSelect}
          />
          <ModeOption
            mode="manual"
            current={billingMode}
            disabled={isPending}
            onSelect={handleSelect}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ModeOption({
  mode,
  current,
  disabled,
  onSelect,
}: {
  mode: BillingMode;
  current: BillingMode;
  disabled: boolean;
  onSelect: (m: BillingMode) => void;
}) {
  const Icon = mode === 'manual' ? MousePointer : Calendar;
  const label = mode === 'manual' ? MANUAL_LABEL : AUTO_LABEL;
  const description = mode === 'manual' ? MANUAL_DESCRIPTION : AUTO_DESCRIPTION;
  const active = mode === current;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(mode)}
      className={cn(
        'border-border flex w-full cursor-pointer flex-col items-start gap-1 rounded border p-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        active
          ? mode === 'manual'
            ? 'border-orange-300 bg-orange-50'
            : 'border-gray-300 bg-gray-50'
          : 'hover:bg-muted/30',
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold">
        <Icon className="h-3.5 w-3.5" />
        {label}
        {active && (
          <span className="text-muted-foreground ml-1 text-[10px] font-normal">
            (actuel)
          </span>
        )}
      </span>
      <span className="text-muted-foreground text-xs leading-relaxed">
        {description}
      </span>
    </button>
  );
}
