'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  FolderKanban,
  Building2,
  Plus,
  FileText,
  FileSignature,
  GraduationCap,
  ScrollText,
} from 'lucide-react';
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { matchesSearch } from '@/lib/utils/search';
import { isAdmin } from '@/lib/utils/roles';
import {
  allNavItems,
  canAccessNavItem,
  type NavGateUser,
} from '@/components/layout/nav-config';

interface SearchResults {
  projets: { ref: string; client: { raison_sociale: string } | null }[];
  clients: { id: string; trigramme: string; raison_sociale: string }[];
  factures: { ref: string; projet: { ref: string } | null }[];
  apprenants: {
    id: string;
    nom: string | null;
    prenom: string | null;
    projet: { ref: string };
  }[];
  contrats: {
    id: string;
    contract_number: string | null;
    ref: string | null;
    apprenant_nom: string | null;
    apprenant_prenom: string | null;
    projet: { ref: string } | null;
  }[];
  devis: {
    id: string;
    ref: string | null;
    client: { raison_sociale: string } | null;
  }[];
}

const EMPTY_RESULTS: SearchResults = {
  projets: [],
  clients: [],
  factures: [],
  apprenants: [],
  contrats: [],
  devis: [],
};

// Pages + actions sont dérivées de la nav-config partagée (même gating de rôle
// que la sidebar). Seules les actions rapides et les résultats dynamiques
// vers des pages admin sont gardés à part.
export function CommandPalette({ user }: { user: NavGateUser }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const { push } = useRouter();

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery('');
      setResults(EMPTY_RESULTS);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Recherche debouncee : 250ms apres la derniere frappe, q >= 2 chars.
  // oxlint-disable-next-line react-doctor/no-fetch-in-effect
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      fetchAbortRef.current?.abort();
      return;
    }
    const handle = setTimeout(async () => {
      fetchAbortRef.current?.abort();
      const ctrl = new AbortController();
      fetchAbortRef.current = ctrl;
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
          {
            signal: ctrl.signal,
          },
        );
        if (!res.ok) return;
        const data = (await res.json()) as SearchResults;
        setResults({
          projets: data.projets ?? [],
          clients: data.clients ?? [],
          factures: data.factures ?? [],
          apprenants: data.apprenants ?? [],
          contrats: data.contrats ?? [],
          devis: data.devis ?? [],
        });
      } catch {
        // abort ou erreur reseau : on garde les anciens resultats.
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open]);

  const displayedResults = useMemo<SearchResults>(
    () => (query.trim().length >= 2 ? results : EMPTY_RESULTS),
    [query, results],
  );

  const navigateTo = useCallback(
    (href: string) => {
      handleOpenChange(false);
      push(href);
    },
    [push, handleOpenChange],
  );

  // Pages accessibles à l'utilisateur (gating unique partagé avec la sidebar).
  const pages = useMemo(
    () => allNavItems.filter((item) => canAccessNavItem(item, user)),
    [user],
  );
  const showAdminResults = isAdmin(user.role);

  const hasDynamic =
    displayedResults.projets.length > 0 ||
    (showAdminResults && displayedResults.clients.length > 0) ||
    displayedResults.factures.length > 0 ||
    displayedResults.apprenants.length > 0 ||
    displayedResults.contrats.length > 0 ||
    (showAdminResults && displayedResults.devis.length > 0);

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Palette de commandes"
      description="Rechercher une page, un projet, un client, une facture, un apprenant, un contrat, un devis"
      className="sm:max-w-lg"
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Rechercher une page, un projet, un client..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>Aucun résultat.</CommandEmpty>
          {hasDynamic && (
            <>
              {displayedResults.projets.length > 0 && (
                <CommandGroup heading="Projets">
                  {displayedResults.projets.map((p) => (
                    <CommandItem
                      key={`projet-${p.ref}`}
                      value={`projet-${p.ref}-${p.client?.raison_sociale ?? ''}`}
                      onSelect={() => navigateTo(`/projets/${p.ref}`)}
                      className="cursor-pointer"
                    >
                      <FolderKanban className="text-muted-foreground size-4" />
                      <span className="font-mono text-xs">{p.ref}</span>
                      {p.client && (
                        <span className="text-muted-foreground truncate text-xs">
                          {p.client.raison_sociale}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {showAdminResults && displayedResults.clients.length > 0 && (
                <CommandGroup heading="Clients">
                  {displayedResults.clients.map((c) => (
                    <CommandItem
                      key={`client-${c.id}`}
                      value={`client-${c.trigramme}-${c.raison_sociale}`}
                      onSelect={() => navigateTo(`/admin/clients/${c.id}`)}
                      className="cursor-pointer"
                    >
                      <Building2 className="text-muted-foreground size-4" />
                      <span className="font-mono text-xs">{c.trigramme}</span>
                      <span className="truncate text-sm">
                        {c.raison_sociale}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {displayedResults.factures.length > 0 && (
                <CommandGroup heading="Factures">
                  {displayedResults.factures.map((f) => (
                    <CommandItem
                      key={`facture-${f.ref}`}
                      value={`facture-${f.ref}`}
                      onSelect={() => navigateTo(`/facturation/${f.ref}`)}
                      className="cursor-pointer"
                    >
                      <FileText className="text-muted-foreground size-4" />
                      <span className="font-mono text-xs">{f.ref}</span>
                      {f.projet && (
                        <span className="text-muted-foreground truncate text-xs">
                          {f.projet.ref}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {displayedResults.apprenants.length > 0 && (
                <CommandGroup heading="Apprenants">
                  {displayedResults.apprenants.map((a) => (
                    <CommandItem
                      key={`apprenant-${a.id}`}
                      value={`apprenant-${a.id}`}
                      onSelect={() => navigateTo(`/projets/${a.projet.ref}`)}
                      className="cursor-pointer"
                    >
                      <GraduationCap className="text-muted-foreground size-4" />
                      <span className="truncate text-sm">
                        {[a.prenom, a.nom].filter(Boolean).join(' ') || '-'}
                      </span>
                      <span className="text-muted-foreground truncate font-mono text-xs">
                        {a.projet.ref}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {displayedResults.contrats.length > 0 && (
                <CommandGroup heading="Contrats">
                  {displayedResults.contrats.map((c) => (
                    <CommandItem
                      key={`contrat-${c.id}`}
                      value={`contrat-${c.id}`}
                      onSelect={() =>
                        navigateTo(`/projets/${c.projet?.ref ?? ''}`)
                      }
                      className="cursor-pointer"
                    >
                      <FileSignature className="text-muted-foreground size-4" />
                      <span className="font-mono text-xs">
                        {c.contract_number ?? c.ref ?? '-'}
                      </span>
                      <span className="text-muted-foreground truncate text-xs">
                        {[c.apprenant_prenom, c.apprenant_nom]
                          .filter(Boolean)
                          .join(' ')}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {showAdminResults && displayedResults.devis.length > 0 && (
                <CommandGroup heading="Devis">
                  {displayedResults.devis.map((d) => (
                    <CommandItem
                      key={`devis-${d.id}`}
                      value={`devis-${d.id}`}
                      onSelect={() => navigateTo(`/devis/${d.ref ?? d.id}`)}
                      className="cursor-pointer"
                    >
                      <ScrollText className="text-muted-foreground size-4" />
                      <span className="font-mono text-xs">{d.ref}</span>
                      {d.client && (
                        <span className="text-muted-foreground truncate text-xs">
                          {d.client.raison_sociale}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandSeparator />
            </>
          )}
          <CommandGroup heading="Pages">
            {pages.flatMap((item) => {
              if (query && !matchesSearch(item.label, query)) return [];
              const Icon = item.icon;
              return [
                <CommandItem
                  key={item.href}
                  value={`page-${item.label}`}
                  onSelect={() => navigateTo(item.href)}
                  className="cursor-pointer"
                >
                  <Icon className="text-muted-foreground size-4" />
                  <span>{item.label}</span>
                </CommandItem>,
              ];
            })}
          </CommandGroup>
          {showAdminResults &&
            (!query || matchesSearch('Nouveau client', query)) && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Actions rapides">
                  <CommandItem
                    value="action-nouveau-client"
                    onSelect={() => {
                      handleOpenChange(false);
                      push('/admin/clients?action=nouveau');
                    }}
                    className="cursor-pointer"
                  >
                    <Plus className="text-muted-foreground size-4" />
                    <span>Nouveau client</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
