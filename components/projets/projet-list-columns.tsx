'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ProjetListEnriched } from '@/lib/queries/projets';
import { buttonVariants } from '@/components/ui/button-variants';
import { DataTableColumnHeader } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { ProjectRef } from '@/components/shared/project-ref';
import { formatCurrency, formatHeures } from '@/lib/utils/formatters';
import {
  STATUT_PROJET_LABELS,
  STATUT_PROJET_COLORS,
} from '@/lib/utils/constants';
import { textFilterFn } from '@/lib/utils/table-filters';

export const projetListColumns: ColumnDef<ProjetListEnriched>[] = [
  {
    // Acces explicite a la fiche projet : le clic-ligne existe mais rien ne
    // le signalait, et la colonne Client (lien fiche client) attirait le
    // clic. Meme pattern que la colonne Apercu de /facturation.
    id: 'ouvrir',
    header: () => null,
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
    size: 48,
    cell: ({ row }) => {
      const ref = row.original.ref;
      if (!ref) return null;
      return (
        <Link
          href={`/projets/${ref}`}
          aria-label={`Ouvrir la fiche projet ${ref}`}
          title="Ouvrir la fiche projet"
          className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
          onClick={(e) => e.stopPropagation()}
        >
          <ArrowRight className="size-4" />
        </Link>
      );
    },
  },
  {
    accessorKey: 'ref',
    enableHiding: false,
    meta: { label: 'N° Projet' },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="N° Projet" />
    ),
    cell: ({ row }) => <ProjectRef ref_={row.original.ref ?? ''} />,
  },
  {
    id: 'client',
    meta: { label: 'Client' },
    accessorFn: (row) => row.client?.raison_sociale ?? '',
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="Client"
        filterVariant="text"
      />
    ),
    cell: ({ row }) => {
      const client = row.original.client;
      if (!client)
        return <span className="text-muted-foreground text-sm">-</span>;
      return (
        <Link
          href={`/admin/clients/${client.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-sm hover:underline"
        >
          {client.raison_sociale}
        </Link>
      );
    },
    enableColumnFilter: true,
    filterFn: textFilterFn,
  },
  {
    id: 'cdp',
    meta: { label: 'CDP' },
    accessorFn: (row) => (row.cdp ? `${row.cdp.prenom} ${row.cdp.nom}` : ''),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="CDP" filterVariant="text" />
    ),
    cell: ({ row }) => {
      const cdp = row.original.cdp;
      if (!cdp) return <span className="text-muted-foreground text-sm">-</span>;
      return (
        <Link
          href="/admin/utilisateurs"
          onClick={(e) => e.stopPropagation()}
          className="text-sm hover:underline"
          title={`${cdp.prenom} ${cdp.nom}`}
        >
          {cdp.prenom} {cdp.nom}
        </Link>
      );
    },
    enableColumnFilter: true,
    filterFn: textFilterFn,
  },
  {
    accessorKey: 'statut',
    enableHiding: false,
    meta: { label: 'Statut' },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Statut" />
    ),
    cell: ({ row }) => {
      const statut = row.original.statut;
      return (
        <StatusBadge
          label={STATUT_PROJET_LABELS[statut] || statut}
          color={STATUT_PROJET_COLORS[statut] || 'gray'}
        />
      );
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    id: 'typologie',
    meta: { label: 'Typologie' },
    accessorFn: (row) => row.typologie?.code ?? '',
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="Typologie"
        filterVariant="text"
      />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.typologie?.libelle}</span>
    ),
    enableColumnFilter: true,
    filterFn: textFilterFn,
  },
  {
    accessorKey: 'taux_commission',
    meta: { label: 'Commission' },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Commission" />
    ),
    cell: ({ row }) => (
      <Link
        href={`/projets/${row.original.ref}`}
        onClick={(e) => e.stopPropagation()}
        className="text-sm tabular-nums hover:underline"
      >
        {row.original.taux_commission}%
      </Link>
    ),
  },
  {
    accessorKey: 'modele_facturation',
    meta: { label: 'Modèle' },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Modèle" />
    ),
    cell: ({ row }) =>
      row.original.modele_facturation === 'engagement' ? (
        <StatusBadge label="À l'engagement" color="green" />
      ) : (
        <StatusBadge label="Échéancier" color="blue" />
      ),
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: 'apprentisActifs',
    meta: { label: 'Apprentis actifs' },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Apprentis actifs" />
    ),
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">
        {row.original.apprentisActifs}
      </span>
    ),
  },
  {
    accessorKey: 'facturesEnRetard',
    meta: { label: 'Factures en retard' },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fact. retard" />
    ),
    cell: ({ row }) => {
      const count = row.original.facturesEnRetard;
      if (count > 0) {
        return <StatusBadge label={String(count)} color="red" />;
      }
      return <span className="text-sm tabular-nums">0</span>;
    },
  },
  {
    accessorKey: 'encaissementsEnRetard',
    meta: { label: 'Encaissements en retard' },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Enc. retard" />
    ),
    cell: ({ row }) => {
      const amount = row.original.encaissementsEnRetard;
      const amountTtc = row.original.encaissementsEnRetardTtc;
      return (
        <span
          className={`inline-flex flex-col text-sm tabular-nums ${amount > 0 ? 'font-medium text-[var(--destructive)]' : ''}`}
        >
          <span>{formatCurrency(amount)}</span>
          {amount > 0 && (
            <span className="text-muted-foreground text-[10px] leading-tight font-normal">
              {formatCurrency(amountTtc)} TTC
            </span>
          )}
        </span>
      );
    },
  },
  {
    accessorKey: 'tempsMois',
    meta: { label: 'Temps du mois' },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Temps" />
    ),
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">
        {formatHeures(row.original.tempsMois)}
      </span>
    ),
  },
];
