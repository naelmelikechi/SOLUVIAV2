'use client';

import type { ColumnDef, FilterFn } from '@tanstack/react-table';
import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { DataTableColumnHeader } from '@/components/shared/data-table';
import { StatusBadge, type BadgeColor } from '@/components/shared/status-badge';
import { ProspectSanteBadge } from '@/components/commercial/prospect-sante-badge';
import { textFilterFn } from '@/lib/utils/table-filters';
import { formatDate } from '@/lib/utils/formatters';
import { computeSanteProspect } from '@/lib/utils/sante-prospect';
import {
  STAGE_PROSPECT_LABELS,
  STAGE_PROSPECT_COLORS,
  TYPE_PROSPECT_LABELS,
  CANAL_ORIGINE_LABELS,
  type StageProspect,
  type TypeProspect,
  type CanalOrigine,
} from '@/lib/utils/constants';
import type { ProspectListItem } from '@/lib/queries/prospects';

// Tunnel n'a pas de palette canonique dans les constantes : on distingue
// simplement CFA / Entreprise par une couleur stable et lisible.
const TYPE_PROSPECT_COLORS: Record<TypeProspect, BadgeColor> = {
  cfa: 'blue',
  entreprise: 'purple',
};

// filterFn des multi-selects de la toolbar (FilterOption) : la cellule (enum)
// doit appartenir au tableau de valeurs cochees.
const enumIncludes: FilterFn<ProspectListItem> = (row, columnId, filterValue) =>
  filterValue.includes(row.getValue(columnId));

export const prospectListColumns: ColumnDef<ProspectListItem>[] = [
  {
    accessorKey: 'nom',
    meta: { label: 'Raison sociale' },
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="Raison sociale"
        filterVariant="text"
      />
    ),
    cell: ({ row }) => <span className="font-medium">{row.original.nom}</span>,
    filterFn: textFilterFn,
    enableColumnFilter: true,
  },
  {
    accessorKey: 'type_prospect',
    meta: { label: 'Tunnel' },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tunnel" />
    ),
    cell: ({ row }) => {
      const type = row.original.type_prospect as TypeProspect;
      return (
        <StatusBadge
          label={TYPE_PROSPECT_LABELS[type] ?? type}
          color={TYPE_PROSPECT_COLORS[type] ?? 'gray'}
        />
      );
    },
    filterFn: enumIncludes,
  },
  {
    accessorKey: 'stage',
    meta: { label: 'Étape' },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Étape" />
    ),
    cell: ({ row }) => {
      const stage = row.original.stage as StageProspect;
      return (
        <StatusBadge
          label={STAGE_PROSPECT_LABELS[stage] ?? stage}
          color={STAGE_PROSPECT_COLORS[stage] ?? 'gray'}
        />
      );
    },
    filterFn: enumIncludes,
  },
  {
    accessorKey: 'canal_origine',
    meta: { label: "Canal d'origine" },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Canal" />
    ),
    cell: ({ row }) => {
      const canal = row.original.canal_origine as CanalOrigine | null;
      return canal ? (CANAL_ORIGINE_LABELS[canal] ?? canal) : '-';
    },
    filterFn: enumIncludes,
  },
  {
    // Colonne fusionnee « Derniere action + indicateur sante » : l'accessor
    // expose le niveau de sante (pour le filtre), le tri reste chronologique.
    id: 'sante',
    accessorFn: (row) => computeSanteProspect(row.derniere_action_at),
    meta: { label: 'Dernière action' },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Dernière action" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span>{formatDate(row.original.derniere_action_at)}</span>
        <ProspectSanteBadge
          derniereActionAt={row.original.derniere_action_at}
        />
      </div>
    ),
    filterFn: enumIncludes,
    enableColumnFilter: true,
    sortingFn: (a, b) =>
      new Date(a.original.derniere_action_at).getTime() -
      new Date(b.original.derniere_action_at).getTime(),
  },
  {
    accessorKey: 'prochaine_action_at',
    meta: { label: 'Prochaine action' },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Prochaine action" />
    ),
    cell: ({ row }) =>
      row.original.prochaine_action_at
        ? formatDate(row.original.prochaine_action_at)
        : '-',
  },
  {
    accessorKey: 'volume_apprenants',
    meta: { label: 'Volume' },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Volume" />
    ),
    cell: ({ row }) =>
      row.original.volume_apprenants != null
        ? row.original.volume_apprenants.toLocaleString('fr-FR')
        : '-',
  },
  {
    id: 'commercial',
    accessorFn: (row) =>
      row.commercial ? `${row.commercial.prenom} ${row.commercial.nom}` : '',
    meta: { label: 'Développeur' },
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="Développeur"
        filterVariant="text"
      />
    ),
    cell: ({ row }) =>
      row.original.commercial
        ? `${row.original.commercial.prenom} ${row.original.commercial.nom}`
        : '-',
    filterFn: textFilterFn,
    enableColumnFilter: true,
  },
  {
    id: 'contact_mail',
    accessorFn: (row) =>
      row.contact_principal?.email ?? row.dirigeant_email ?? '',
    meta: { label: 'Contact mail' },
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="Contact mail"
        filterVariant="text"
      />
    ),
    cell: ({ row }) => {
      const email =
        row.original.contact_principal?.email ?? row.original.dirigeant_email;
      return email ? (
        <span className="text-sm">{email}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    },
    filterFn: textFilterFn,
    enableColumnFilter: true,
  },
  {
    id: 'contact_tel',
    accessorFn: (row) =>
      row.contact_principal?.telephone ?? row.dirigeant_telephone ?? '',
    meta: { label: 'Contact tél' },
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="Contact tél"
        filterVariant="text"
      />
    ),
    cell: ({ row }) => {
      const tel =
        row.original.contact_principal?.telephone ??
        row.original.dirigeant_telephone;
      return tel ? (
        <span className="text-sm">{tel}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    },
    filterFn: textFilterFn,
    enableColumnFilter: true,
  },
  {
    id: 'communications',
    meta: { label: 'Historique' },
    header: 'Historique',
    enableSorting: false,
    cell: ({ row }) => (
      <Link
        href={`/commercial/prospects/${row.original.id}?tab=communications`}
        onClick={(e) => e.stopPropagation()}
        className="text-muted-foreground hover:text-foreground inline-flex"
      >
        <MessageSquare className="size-4" aria-hidden="true" />
        <span className="sr-only">Historique des communications</span>
      </Link>
    ),
  },
];
