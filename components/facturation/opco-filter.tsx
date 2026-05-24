'use client';

import { useMemo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface BillableEventLike {
  opco_code: string | null;
  opco_nom: string | null;
  status: string;
}

interface Props {
  events: BillableEventLike[];
  selected: string[]; // OPCO codes selected
  onChange: (codes: string[]) => void;
}

interface OpcoStat {
  code: string;
  nom: string;
  count: number;
}

export function OpcoFilter({ events, selected, onChange }: Props) {
  const stats = useMemo<OpcoStat[]>(() => {
    const byCode = new Map<string, OpcoStat>();
    for (const e of events) {
      if (e.status !== 'available' || !e.opco_code) continue;
      const existing = byCode.get(e.opco_code);
      if (existing) existing.count++;
      else
        byCode.set(e.opco_code, {
          code: e.opco_code,
          nom: e.opco_nom ?? e.opco_code,
          count: 1,
        });
    }
    return Array.from(byCode.values()).sort((a, b) =>
      a.code.localeCompare(b.code),
    );
  }, [events]);

  const unknownCount = useMemo(
    () => events.filter((e) => e.status === 'locked' && !e.opco_code).length,
    [events],
  );

  function toggle(code: string) {
    if (selected.includes(code)) onChange(selected.filter((c) => c !== code));
    else onChange([...selected, code]);
  }

  if (stats.length === 0 && unknownCount === 0) return null;

  return (
    <div className="bg-muted/50 rounded-lg border p-4">
      <h4 className="mb-3 text-sm font-semibold">OPCO a inclure</h4>
      <div className="space-y-2">
        {stats.map((s) => (
          <div key={s.code} className="flex items-center gap-2">
            <Checkbox
              id={`opco-${s.code}`}
              checked={selected.includes(s.code)}
              onCheckedChange={() => toggle(s.code)}
            />
            <Label htmlFor={`opco-${s.code}`} className="flex-1 cursor-pointer">
              {s.nom}{' '}
              <span className="text-muted-foreground">
                ({s.count} {s.count > 1 ? 'lignes' : 'ligne'})
              </span>
            </Label>
          </div>
        ))}
        {unknownCount > 0 && (
          <div className="border-t pt-2">
            <Badge variant="destructive">
              {unknownCount} contrat(s) avec OPCO non identifie - mappez le
              prefixe dans /admin/parametres/opcos
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}
