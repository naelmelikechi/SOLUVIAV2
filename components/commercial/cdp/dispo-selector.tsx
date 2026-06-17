'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DISPO_CDP_LABELS, type DispoCdp } from '@/lib/utils/constants';
import { updateCdpDisponibilite } from '@/lib/actions/cdp';

const DISPO_ENTRIES = Object.entries(DISPO_CDP_LABELS) as [DispoCdp, string][];

interface DispoSelectorProps {
  value: DispoCdp | null;
}

export function DispoSelector({ value }: DispoSelectorProps) {
  const router = useRouter();
  const [dispo, setDispo] = useState<DispoCdp | null>(value);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: DispoCdp) {
    const previous = dispo;
    setDispo(next);
    startTransition(async () => {
      const res = await updateCdpDisponibilite(next);
      if (res.success) {
        toast.success('Disponibilité mise à jour');
        router.refresh();
      } else {
        setDispo(previous);
        toast.error(res.error ?? 'Erreur');
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-sm">Ma disponibilité</span>
      <Select
        value={dispo ?? ''}
        onValueChange={(v) => v && handleChange(v as DispoCdp)}
        disabled={isPending}
      >
        <SelectTrigger size="sm" className="w-40">
          <SelectValue placeholder="Non déclarée">
            {(v) => (v ? DISPO_CDP_LABELS[v as DispoCdp] : 'Non déclarée')}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {DISPO_ENTRIES.map(([val, label]) => (
            <SelectItem key={val} value={val}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
