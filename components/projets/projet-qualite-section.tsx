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
      <Card className="p-6">
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck className="text-muted-foreground h-4 w-4" />
          <h3 className="text-sm font-semibold">Qualité Qualiopi</h3>
        </div>
        <p className="text-muted-foreground text-sm">
          Aucun client associé à ce projet.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="text-primary h-4 w-4" />
        <h3 className="text-sm font-semibold">Qualité Qualiopi</h3>
      </div>
      <p className="text-muted-foreground mb-3 text-xs">
        Le suivi des indicateurs Qualiopi se fait par CFA. Données synchronisées
        depuis Eduvia.
      </p>
      <Link
        href={`/qualiopi/${clientTrigramme}`}
        className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs font-medium"
      >
        Voir la qualité de ce CFA
        <ArrowRight className="h-3 w-3" />
      </Link>
    </Card>
  );
}
