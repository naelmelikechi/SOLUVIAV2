import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { CarteSynthese, TonCarte } from '@/lib/projets/synthese';

const TON_VALEUR: Record<TonCarte, string> = {
  neutre: 'text-foreground',
  attention: 'text-amber-600 dark:text-amber-500',
  alerte: 'text-red-600 dark:text-red-400',
};

/**
 * Grille seule : les cartes sont passees en children pour que la synthese
 * puisse glisser un <Suspense> au milieu (carte Qualite, plus lente que les
 * autres). Les 5 cartes tiennent sur une seule rangee en grand ecran, ou le
 * coup d'oeil doit suffire.
 */
export function ProjetSyntheseGrille({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {children}
    </div>
  );
}

export function ProjetCarteTile({ carte }: { carte: CarteSynthese }) {
  return (
    <Link href={carte.href} className="group">
      <Card className="hover:border-primary/40 h-full gap-2 p-5 transition-colors">
        <div className="text-muted-foreground flex items-center justify-between text-[11px] font-medium tracking-wider uppercase">
          <span>{carte.titre}</span>
          <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <p
          className={`text-3xl font-bold tabular-nums ${TON_VALEUR[carte.ton]}`}
        >
          {carte.valeur}
        </p>
        <p className="text-muted-foreground text-sm">{carte.contexte}</p>
        {carte.alerteSecondaire && (
          <p className="text-xs font-medium text-[var(--warning)]">
            {carte.alerteSecondaire}
          </p>
        )}
      </Card>
    </Link>
  );
}

/**
 * Fallback de Suspense : memes Card, padding et hauteurs de lignes que
 * ProjetCarteTile, pour que l'arrivee de la vraie carte ne decale rien.
 */
export function ProjetCarteChargement({ titre }: { titre: string }) {
  return (
    <Card className="h-full gap-2 p-5">
      <div className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        {titre}
      </div>
      <Skeleton className="h-9 w-20" />
      <Skeleton className="h-5 w-28" />
    </Card>
  );
}
