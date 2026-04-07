import { ProjectRef } from '@/components/shared/project-ref';
import { StatusBadge } from '@/components/shared/status-badge';
import type { MockProjet } from '@/lib/mock-data';
import {
  STATUT_PROJET_LABELS,
  STATUT_PROJET_COLORS,
} from '@/lib/utils/constants';

export function ProjetDetailHeader({ projet }: { projet: MockProjet }) {
  return (
    <div className="mb-6 flex items-center gap-4">
      <ProjectRef ref_={projet.ref} className="text-sm" />
      <span className="text-lg font-semibold">
        {projet.client.raison_sociale}
      </span>
      <span className="text-muted-foreground text-sm">
        {projet.typologie.libelle}
      </span>
      <StatusBadge
        label={STATUT_PROJET_LABELS[projet.statut]}
        color={STATUT_PROJET_COLORS[projet.statut]}
      />
    </div>
  );
}
