'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FolderKanban,
  Receipt,
  ClipboardCheck,
  BarChart3,
  Clock,
  Bell,
  Building2,
  Users,
  UsersRound,
  Settings,
  User,
  Plus,
  FileText,
  FileSignature,
  GraduationCap,
  Sparkles,
  ScrollText,
  LineChart,
  Lightbulb,
  Target,
  Bug,
  Landmark,
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
import type { LucideIcon } from 'lucide-react';
import { matchesSearch } from '@/lib/utils/search';

interface SearchResults {
  projets: { ref: string; client: { raison_sociale: string } | null }[];
  clients: { id: string; trigramme: string; raison_sociale: string }[];
  factures: { numero: string; projet: { ref: string } | null }[];
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
}

const EMPTY_RESULTS: SearchResults = {
  projets: [],
  clients: [],
  factures: [],
  apprenants: [],
  contrats: [],
};

interface CommandPaletteItem {
  label: string;
  href?: string;
  action?: string;
  section: 'Pages' | 'Actions';
  icon: LucideIcon;
}

const items: CommandPaletteItem[] = [
  // Pilotage
  {
    label: 'Tableau de bord',
    href: '/dashboard',
    section: 'Pages',
    icon: LayoutDashboard,
  },
  {
    label: 'Indicateurs',
    href: '/indicateurs',
    section: 'Pages',
    icon: LineChart,
  },
  // Operations
  {
    label: 'Projets',
    href: '/projets',
    section: 'Pages',
    icon: FolderKanban,
  },
  {
    label: 'Projets internes',
    href: '/projets/internes',
    section: 'Pages',
    icon: Sparkles,
  },
  { label: 'Temps', href: '/temps', section: 'Pages', icon: Clock },
  {
    label: 'Qualité',
    href: '/qualiopi',
    section: 'Pages',
    icon: ClipboardCheck,
  },
  {
    label: 'Production',
    href: '/production',
    section: 'Pages',
    icon: BarChart3,
  },
  // Commercial
  {
    label: 'Pipeline',
    href: '/commercial/pipeline',
    section: 'Pages',
    icon: Target,
  },
  // Facturation
  {
    label: 'Devis',
    href: '/devis',
    section: 'Pages',
    icon: ScrollText,
  },
  {
    label: 'Facturation',
    href: '/facturation',
    section: 'Pages',
    icon: Receipt,
  },
  // Equipe
  {
    label: 'Équipe',
    href: '/equipe',
    section: 'Pages',
    icon: Users,
  },
  {
    label: 'Idées',
    href: '/idees',
    section: 'Pages',
    icon: Lightbulb,
  },
  {
    label: 'Notifications',
    href: '/notifications',
    section: 'Pages',
    icon: Bell,
  },
  // Administration
  {
    label: 'Clients',
    href: '/admin/clients',
    section: 'Pages',
    icon: Building2,
  },
  {
    label: 'Utilisateurs',
    href: '/admin/utilisateurs',
    section: 'Pages',
    icon: Users,
  },
  {
    label: 'Intercontrat',
    href: '/admin/intercontrat',
    section: 'Pages',
    icon: UsersRound,
  },
  {
    label: 'Bugs',
    href: '/admin/bugs',
    section: 'Pages',
    icon: Bug,
  },
  {
    label: 'Paramètres',
    href: '/admin/parametres',
    section: 'Pages',
    icon: Settings,
  },
  {
    label: 'Référentiel OPCO',
    href: '/admin/parametres/opcos',
    section: 'Pages',
    icon: Landmark,
  },
  {
    label: 'Mon compte',
    href: '/parametres-compte',
    section: 'Pages',
    icon: User,
  },
  // Actions rapides
  {
    label: 'Nouveau client',
    action: 'create-client',
    section: 'Actions',
    icon: Plus,
  },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const { push } = useRouter();

  // Quand on referme la palette, on reset le query et les resultats. cmdk
  // appelle onOpenChange(false) sur Escape / clic-out / select : c'est le seul
  // point qui ferme la palette donc on centralise le reset ici.
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
  // On ne lance le fetch que quand on a une query valide. Pour les transitions
  // "query trop courte", on derive simplement l'affichage via useMemo plus bas
  // au lieu de reset l'etat ici - ca evite le warning react-hooks/set-state-in-effect.
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
          { signal: ctrl.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as SearchResults;
        setResults({
          projets: data.projets ?? [],
          clients: data.clients ?? [],
          factures: data.factures ?? [],
          apprenants: data.apprenants ?? [],
          contrats: data.contrats ?? [],
        });
      } catch {
        // abort ou erreur reseau : on garde les anciens resultats.
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open]);

  // Affiche les resultats uniquement si la query est suffisamment longue.
  // Les anciens resultats restent en memoire mais sont masques pour eviter
  // d'afficher des resultats "fantome" quand l'utilisateur efface l'input.
  const displayedResults = useMemo<SearchResults>(
    () => (query.trim().length >= 2 ? results : EMPTY_RESULTS),
    [query, results],
  );

  const handleSelect = useCallback(
    (item: CommandPaletteItem) => {
      handleOpenChange(false);
      if (item.href) {
        push(item.href);
      } else if (item.action === 'create-client') {
        push('/admin/clients?action=nouveau');
      }
    },
    [push, handleOpenChange],
  );

  const navigateTo = useCallback(
    (href: string) => {
      handleOpenChange(false);
      push(href);
    },
    [push, handleOpenChange],
  );

  const pages = items.filter((i) => i.section === 'Pages');
  const actions = items.filter((i) => i.section === 'Actions');

  const hasDynamic =
    displayedResults.projets.length > 0 ||
    displayedResults.clients.length > 0 ||
    displayedResults.factures.length > 0 ||
    displayedResults.apprenants.length > 0 ||
    displayedResults.contrats.length > 0;

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Palette de commandes"
      description="Rechercher une page, un projet, un client, une facture, un apprenant, un contrat"
      className="sm:max-w-lg"
    >
      <Command
        // Les resultats dynamiques (preserves via cmdk values uniques) ne sont
        // pas filtres cote client : c'est l'API qui filtre. Pour les pages
        // statiques, on garde le matcher accent-insensitive existant.
        shouldFilter={false}
      >
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
              {displayedResults.clients.length > 0 && (
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
                      key={`facture-${f.numero}`}
                      value={`facture-${f.numero}`}
                      onSelect={() => navigateTo(`/facturation/${f.numero}`)}
                      className="cursor-pointer"
                    >
                      <FileText className="text-muted-foreground size-4" />
                      <span className="font-mono text-xs">{f.numero}</span>
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
              <CommandSeparator />
            </>
          )}
          <CommandGroup heading="Pages">
            {pages.flatMap((item) => {
              if (query && !matchesSearch(item.label, query)) return [];
              const Icon = item.icon;
              return [
                <CommandItem
                  key={item.label}
                  value={`page-${item.label}`}
                  onSelect={() => handleSelect(item)}
                  className="cursor-pointer"
                >
                  <Icon className="text-muted-foreground size-4" />
                  <span>{item.label}</span>
                </CommandItem>,
              ];
            })}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions rapides">
            {actions.flatMap((item) => {
              if (query && !matchesSearch(item.label, query)) return [];
              const Icon = item.icon;
              return [
                <CommandItem
                  key={item.label}
                  value={`action-${item.label}`}
                  onSelect={() => handleSelect(item)}
                  className="cursor-pointer"
                >
                  <Icon className="text-muted-foreground size-4" />
                  <span>{item.label}</span>
                </CommandItem>,
              ];
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
