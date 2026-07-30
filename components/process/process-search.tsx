'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Search, ArrowRight } from 'lucide-react';
import { searchProcessAction } from '@/app/(dashboard)/process/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ProcessSearchResult } from '@/lib/process/types';

export function ProcessSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProcessSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    startTransition(async () => {
      const res = await searchProcessAction(q);
      setResults(res);
      setSearched(true);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pose ta question (ex. comment facturer un OPCO ?)"
          aria-label="Question"
          className="flex-1"
        />
        <Button type="submit" disabled={pending}>
          <Search className="size-4" />
          {pending ? 'Recherche…' : 'Rechercher'}
        </Button>
      </form>

      {searched && results.length === 0 && !pending && (
        <p className="text-muted-foreground text-sm">Aucun process trouvé.</p>
      )}

      <ul className="flex flex-col gap-3">
        {results.map((r) => (
          <li key={r.source_fiche_id}>
            <Card>
              <CardContent>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium">{r.titre}</h3>
                  <Badge variant="secondary" className="shrink-0">
                    {r.mission}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {r.snippet}
                </p>
                <Link
                  href={r.url}
                  className="text-primary mt-2 inline-flex items-center gap-1 text-sm underline underline-offset-4"
                >
                  Ouvrir la fiche
                  <ArrowRight className="size-3.5" />
                </Link>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
