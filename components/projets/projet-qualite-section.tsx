import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';

export function ProjetQualiteSection({
  clientTrigramme,
}: {
  clientTrigramme: string | null;
}) {
  if (!clientTrigramme) {
    return (
      <Card className="flex-row items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-muted-foreground size-4" />
          <h3 className="text-sm font-semibold">Qualité Qualiopi</h3>
        </div>
        <p className="text-muted-foreground text-sm">
          Aucun client associé à ce projet
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1 p-4">
      <div className="flex min-w-0 items-center gap-2">
        <ShieldCheck className="text-primary size-4 shrink-0" />
        <h3 className="text-sm font-semibold">Qualité Qualiopi</h3>
        <span
          className="text-muted-foreground hidden truncate text-xs xl:inline"
          title="Le suivi des indicateurs Qualiopi se fait par CFA. Données synchronisées depuis Eduvia."
        >
          Suivi par CFA, données Eduvia
        </span>
      </div>
      <Link
        href={`/qualiopi/${clientTrigramme}`}
        className="text-primary hover:text-primary/80 inline-flex shrink-0 items-center gap-1 text-xs font-medium"
      >
        Voir la qualité de ce CFA
        <ArrowRight className="size-3" />
      </Link>
    </Card>
  );
}
