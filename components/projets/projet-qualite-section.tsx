import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ProjetQualiteStats } from '@/lib/queries/projets';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';

export function ProjetQualiteSection({
  qualite,
  projetRef,
}: {
  qualite: ProjetQualiteStats | null;
  projetRef: string;
}) {
  if (!qualite) {
    return (
      <Card className="p-6">
        <h3 className="mb-2 text-sm font-semibold">Tâches qualité</h3>
        <p className="text-muted-foreground text-sm">
          Aucune tâche synchronisée
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <h3 className="text-sm font-semibold">Tâches qualité</h3>
        <StatusBadge label="Eduvia" color="orange" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="border-border rounded-lg border p-4 text-center">
          <div className="text-primary text-2xl font-bold">
            {qualite.terminees}
          </div>
          <div className="text-muted-foreground text-xs">Terminées</div>
        </div>
        <div className="border-border rounded-lg border p-4 text-center">
          <div className="text-2xl font-bold text-[var(--warning)]">
            {qualite.a_realiser}
          </div>
          <div className="text-muted-foreground text-xs">À réaliser</div>
        </div>
      </div>

      <Link
        href={`/qualite/${projetRef}`}
        className="text-primary hover:text-primary/80 mt-3 inline-flex items-center gap-1 text-xs font-medium"
      >
        Voir la qualité
        <ArrowRight className="h-3 w-3" />
      </Link>
    </Card>
  );
}
