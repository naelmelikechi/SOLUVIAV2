'use client';

import { useState, useTransition } from 'react';
import { ImagePlus, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { searchGiphy, type GiphyResult } from '@/lib/actions/team-chat';

interface GiphyPickerProps {
  onPick: (url: string) => void;
}

/**
 * Inline Giphy search widget. Opens a popover, queries the server action
 * (which forces rating=g for corp-safe content), and returns a URL to insert
 * into the chat.
 */
export function GiphyPicker({ onPick }: GiphyPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GiphyResult[]>([]);
  const [pending, startTransition] = useTransition();

  const runSearch = (q: string) => {
    startTransition(async () => {
      const res = await searchGiphy(q);
      if (res.success) {
        setResults(res.results ?? []);
      } else {
        toast.error(res.error ?? 'Giphy indisponible');
        setResults([]);
      }
    });
  };

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next && results.length === 0) {
      runSearch(''); // fetch trending on first open
    }
  };

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleOpen}
        aria-label="Ajouter un GIF"
        title="Ajouter un GIF"
      >
        <ImagePlus className="h-4 w-4" />
      </Button>

      {open && (
        <div className="bg-popover border-border absolute right-0 bottom-full z-20 mb-2 w-80 rounded-lg border p-2 shadow-lg">
          <div className="mb-2 flex items-center gap-1">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
              <Input
                className="h-8 pl-7 text-sm"
                placeholder="Rechercher un GIF..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    runSearch(query);
                  }
                }}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="grid max-h-72 grid-cols-2 gap-1 overflow-y-auto">
            {pending ? (
              <div className="col-span-2 flex items-center justify-center py-6">
                <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
              </div>
            ) : results.length === 0 ? (
              <p className="text-muted-foreground col-span-2 p-4 text-center text-xs">
                Aucun GIF trouvé.
              </p>
            ) : (
              results.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    onPick(g.full);
                    setOpen(false);
                  }}
                  className="hover:ring-primary overflow-hidden rounded transition-all hover:ring-2"
                  aria-label={`Insérer GIF ${g.title}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={g.preview}
                    alt={g.title || 'GIF'}
                    className="h-20 w-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))
            )}
          </div>

          <p className="text-muted-foreground mt-1 px-1 text-[10px]">
            Powered by GIPHY — contenu filtré (rating G)
          </p>
        </div>
      )}
    </div>
  );
}
