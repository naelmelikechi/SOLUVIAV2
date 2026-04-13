import type { ProjetQualiteStats } from '@/lib/queries/projets';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';

export function ProjetQualiteSection({
  qualite,
}: {
  qualite: ProjetQualiteStats | null;
}) {
  if (!qualite) {
    return (
      <Card className="p-6">
        <h3 className="mb-2 text-sm font-semibold">Taches qualite</h3>
        <p className="text-muted-foreground text-sm">
          Aucune tache synchronisee
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <h3 className="text-sm font-semibold">Taches qualite</h3>
        <StatusBadge label="Eduvia" color="orange" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="border-border rounded-lg border p-4 text-center">
          <div className="text-primary text-2xl font-bold">
            {qualite.terminees}
          </div>
          <div className="text-muted-foreground text-xs">Terminees</div>
        </div>
        <div className="border-border rounded-lg border p-4 text-center">
          <div className="text-2xl font-bold text-[var(--warning)]">
            {qualite.a_realiser}
          </div>
          <div className="text-muted-foreground text-xs">A realiser</div>
        </div>
      </div>
    </Card>
  );
}
