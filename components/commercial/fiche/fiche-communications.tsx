'use client';

import { useMemo, useState } from 'react';
import { Mail } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDate } from '@/lib/utils/formatters';
import type { ProspectCommunication } from '@/lib/queries/prospects';

function humanize(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
}

export function FicheCommunications({
  communications,
}: {
  communications: ProspectCommunication[];
}) {
  const [typeFilter, setTypeFilter] = useState<string>('');

  const types = useMemo(() => {
    const seen = new Set<string>();
    for (const c of communications) seen.add(c.type);
    return Array.from(seen);
  }, [communications]);

  const filtered = useMemo(
    () =>
      typeFilter
        ? communications.filter((c) => c.type === typeFilter)
        : communications,
    [communications, typeFilter],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {filtered.length} communication{filtered.length > 1 ? 's' : ''}
        </p>
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v ?? '')}
        >
          <SelectTrigger size="sm" className="w-48">
            <SelectValue placeholder="Tous les types">
              {(v) => (v ? humanize(v) : 'Tous les types')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tous les types</SelectItem>
            {types.map((t) => (
              <SelectItem key={t} value={t}>
                {humanize(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucune communication.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((c) => (
            <li key={c.id}>
              <Card className="flex items-start gap-3 p-3">
                <Mail className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium">
                      {humanize(c.type)}
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatDate(c.created_at)}
                    </span>
                    {c.user && (
                      <span className="text-muted-foreground text-xs">
                        · {c.user.prenom} {c.user.nom}
                      </span>
                    )}
                  </div>
                  {c.sujet && <p className="text-sm">{c.sujet}</p>}
                  {c.destinataire && (
                    <p className="text-muted-foreground text-xs">
                      À : {c.destinataire}
                    </p>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
