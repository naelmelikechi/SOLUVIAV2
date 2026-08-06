import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { CarteSynthese, TonCarte } from '@/lib/projets/synthese';

const TON_VALEUR: Record<TonCarte, string> = {
  neutre: 'text-foreground',
  attention: 'text-amber-600 dark:text-amber-500',
  alerte: 'text-red-600 dark:text-red-400',
};

export function ProjetSyntheseCards({ cartes }: { cartes: CarteSynthese[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cartes.map((carte) => (
        <Link key={carte.cle} href={carte.href} className="group">
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
          </Card>
        </Link>
      ))}
    </div>
  );
}
