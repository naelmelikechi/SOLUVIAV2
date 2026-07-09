import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  /** Absent sur le dernier élément (page courante, non cliquable). */
  href?: string;
}

// Fil d'Ariane explicite par page : chaque page profonde passe ses crumbs
// avec les vrais noms d'entités (ref projet, raison sociale...), au lieu d'un
// trail auto déduit de l'URL qui affichait des segments bruts. Server-safe.
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="Fil d'Ariane"
      className="mb-1.5 flex items-center gap-1.5 text-sm"
    >
      {items.map((crumb, index) => (
        <span
          key={`${crumb.label}-${index}`}
          className="flex min-w-0 items-center gap-1.5"
        >
          {index > 0 && (
            <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
          )}
          {index === items.length - 1 || !crumb.href ? (
            <span className="text-foreground max-w-[20ch] truncate font-medium sm:max-w-none">
              {crumb.label}
            </span>
          ) : (
            <Link
              href={crumb.href}
              className="text-muted-foreground hover:text-foreground max-w-[16ch] truncate transition-colors sm:max-w-none"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
