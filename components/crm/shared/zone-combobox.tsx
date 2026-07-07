'use client';
import { useEffect, useState } from 'react';
import { ChevronsUpDown, MapPin, X } from 'lucide-react';
import { Button } from '@/components/crm/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/crm/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/crm/ui/command';
import {
  departementLabel,
  regionForDepartement,
  searchLocalZones,
} from '@/lib/crm/domain/geo';

export type Zone = {
  ville: string | null;
  departement: string | null;
  region: string | null;
};

export const EMPTY_ZONE: Zone = {
  ville: null,
  departement: null,
  region: null,
};

type CityResult = { nom: string; codeDepartement: string | null };

/** Libellé d'affichage d'une zone selon sa granularité. */
export function zoneLabel(z: Zone): string | null {
  if (z.ville) return z.departement ? `${z.ville} (${z.departement})` : z.ville;
  if (z.departement) return departementLabel(z.departement);
  if (z.region) return z.region;
  return null;
}

function isEmpty(z: Zone): boolean {
  return !z.ville && !z.departement && !z.region;
}

/**
 * Sélecteur de zone à granularité libre : ville (via l'API Géo du gouvernement),
 * département ou région (locaux). Choisir un niveau remplit ses parents.
 */
export function ZoneCombobox({
  value,
  onChange,
  placeholder = 'Ville, département ou région…',
}: {
  value: Zone;
  onChange: (z: Zone) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cities, setCities] = useState<CityResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Recherche de villes débouncée sur l'API Géo (geo.api.gouv.fr), avec annulation.
  // Tout l'état est mis à jour dans le callback différé (jamais synchronement dans
  // le corps de l'effet) pour éviter les rendus en cascade.
  useEffect(() => {
    const q = query.trim();
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      if (q.length < 2) {
        setCities([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=nom,codeDepartement&boost=population&limit=7`;
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data: CityResult[] = await res.json();
        setCities(Array.isArray(data) ? data : []);
      } catch {
        // API ville indisponible → dégradation : on garde dépt/région locaux.
        setCities([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [query]);

  const locals = searchLocalZones(query, 6);

  const pick = (z: Zone) => {
    onChange(z);
    setOpen(false);
    setQuery('');
  };

  const label = zoneLabel(value);

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              role="combobox"
              className="w-full justify-between font-normal"
            />
          }
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 opacity-50" />
            <span className="truncate">{label ?? placeholder}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-(--anchor-width) p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Rechercher…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {query.trim().length < 2 &&
                cities.length === 0 &&
                locals.length === 0 && (
                  <CommandEmpty>
                    Tapez une ville, un département ou une région.
                  </CommandEmpty>
                )}
              {query.trim().length >= 2 &&
                !loading &&
                cities.length === 0 &&
                locals.length === 0 && (
                  <CommandEmpty>Aucun résultat.</CommandEmpty>
                )}
              {cities.length > 0 && (
                <CommandGroup heading="Villes">
                  {cities.map((c, i) => (
                    <CommandItem
                      key={`${c.nom}-${c.codeDepartement}-${i}`}
                      value={`ville-${c.nom}-${i}`}
                      onSelect={() =>
                        pick({
                          ville: c.nom,
                          departement: c.codeDepartement,
                          region: regionForDepartement(c.codeDepartement),
                        })
                      }
                    >
                      {c.nom}
                      {c.codeDepartement ? (
                        <span className="text-muted-foreground ml-1">
                          ({c.codeDepartement})
                        </span>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {locals.some((z) => z.type === 'departement') && (
                <CommandGroup heading="Départements">
                  {locals
                    .filter((z) => z.type === 'departement')
                    .map((z) => (
                      <CommandItem
                        key={`dep-${z.label}`}
                        value={`dep-${z.label}`}
                        onSelect={() =>
                          pick({
                            ville: null,
                            departement: (z as { code: string }).code,
                            region: z.region,
                          })
                        }
                      >
                        {z.label}
                      </CommandItem>
                    ))}
                </CommandGroup>
              )}
              {locals.some((z) => z.type === 'region') && (
                <CommandGroup heading="Régions">
                  {locals
                    .filter((z) => z.type === 'region')
                    .map((z) => (
                      <CommandItem
                        key={`reg-${z.label}`}
                        value={`reg-${z.label}`}
                        onSelect={() =>
                          pick({
                            ville: null,
                            departement: null,
                            region: z.region,
                          })
                        }
                      >
                        {z.label}
                      </CommandItem>
                    ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {!isEmpty(value) && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive h-9 w-9 shrink-0"
          aria-label="Effacer la zone"
          onClick={() => onChange(EMPTY_ZONE)}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
