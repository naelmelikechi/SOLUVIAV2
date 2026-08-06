'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const ONGLETS = [
  { segment: '', label: 'Synthèse' },
  { segment: 'lancement', label: 'Lancement' },
  { segment: 'production', label: 'Production' },
  { segment: 'finance', label: 'Finance' },
  { segment: 'qualite', label: 'Qualité' },
  { segment: 'contrats', label: 'Contrats' },
] as const;

/**
 * Navigation entre les sous-routes d'un projet. Remplace l'ancienne SectionNav
 * a ancres : chaque zone est desormais une vraie page, donc un vrai lien.
 */
export function ProjetSousNav({ projetRef }: { projetRef: string }) {
  const pathname = usePathname();
  const base = `/projets/${encodeURIComponent(projetRef)}`;

  return (
    <nav
      aria-label="Sections du projet"
      className="bg-background/95 sticky top-0 z-10 -mx-1 mb-4 flex gap-1 overflow-x-auto px-1 py-2 backdrop-blur"
    >
      {ONGLETS.map((onglet) => {
        const href = onglet.segment ? `${base}/${onglet.segment}` : base;
        // La synthese ne doit pas rester active sur les sous-routes, d'ou
        // l'egalite stricte plutot qu'un startsWith.
        const actif = pathname === href;
        return (
          <Link
            key={onglet.segment || 'synthese'}
            href={href}
            aria-current={actif ? 'page' : undefined}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
              actif
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
            )}
          >
            {onglet.label}
          </Link>
        );
      })}
    </nav>
  );
}
