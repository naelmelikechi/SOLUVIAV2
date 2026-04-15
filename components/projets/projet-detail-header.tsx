'use client';

import Link from 'next/link';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { ProjectRef } from '@/components/shared/project-ref';
import { StatusBadge } from '@/components/shared/status-badge';
import type { ProjetDetail } from '@/lib/queries/projets';
import {
  STATUT_PROJET_LABELS,
  STATUT_PROJET_COLORS,
} from '@/lib/utils/constants';

export function ProjetDetailHeader({ projet }: { projet: ProjetDetail }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 md:gap-4">
      <ProjectRef ref_={projet.ref ?? ''} className="text-sm" noLink />
      <button
        onClick={() => {
          navigator.clipboard.writeText(projet.ref ?? '');
          toast.success('Référence copiée');
        }}
        className="text-muted-foreground hover:text-foreground inline-flex items-center"
        title="Copier la référence"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      {projet.client?.id ? (
        <Link
          href={`/admin/clients/${projet.client.id}`}
          className="text-lg font-semibold underline-offset-2 hover:underline"
        >
          {projet.client.raison_sociale}
        </Link>
      ) : (
        <span className="text-lg font-semibold">
          {projet.client?.raison_sociale}
        </span>
      )}
      <span className="text-muted-foreground text-sm">
        {projet.typologie?.libelle}
      </span>
      <StatusBadge
        label={STATUT_PROJET_LABELS[projet.statut] ?? projet.statut}
        color={STATUT_PROJET_COLORS[projet.statut] ?? 'gray'}
      />
    </div>
  );
}
