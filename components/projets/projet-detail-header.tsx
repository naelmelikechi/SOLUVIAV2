'use client';

import Link from 'next/link';
import { CalendarDays, Copy, UserRound, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ProjectRef } from '@/components/shared/project-ref';
import { StatusBadge } from '@/components/shared/status-badge';
import type { ProjetDetail } from '@/lib/queries/projets';
import { formatDate } from '@/lib/utils/formatters';
import {
  STATUT_PROJET_LABELS,
  STATUT_PROJET_COLORS,
} from '@/lib/utils/constants';

export function ProjetDetailHeader({ projet }: { projet: ProjetDetail }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2 md:gap-4">
        <ProjectRef ref_={projet.ref ?? ''} className="text-sm" noLink />
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(projet.ref ?? '');
            toast.success('Référence copiée');
          }}
          className="text-muted-foreground hover:text-foreground inline-flex items-center"
          title="Copier la référence"
        >
          <Copy className="size-3.5" />
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
      {/* Metadonnees d'identite en ligne compacte (remplace les stat cards) */}
      {(projet.cdp || projet.backup_cdp || projet.date_debut) && (
        <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {projet.cdp && (
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="size-3.5" />
              CDP{' '}
              <span className="text-foreground font-medium">
                {projet.cdp.prenom} {projet.cdp.nom}
              </span>
            </span>
          )}
          {projet.backup_cdp && (
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" />
              Backup{' '}
              <span className="text-foreground font-medium">
                {projet.backup_cdp.prenom} {projet.backup_cdp.nom}
              </span>
            </span>
          )}
          {projet.date_debut && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              Début{' '}
              <span className="text-foreground font-medium">
                {formatDate(projet.date_debut)}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
