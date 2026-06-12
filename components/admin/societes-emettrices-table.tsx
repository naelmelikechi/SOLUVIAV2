'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import type { SocieteEmettriceRow } from '@/lib/queries/societes-emettrices';

const columns: ColumnDef<SocieteEmettriceRow>[] = [
  {
    accessorKey: 'code',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Code" />
    ),
    cell: ({ row }) => (
      <span className="font-mono font-semibold">{row.original.code}</span>
    ),
  },
  {
    accessorKey: 'raison_sociale',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Raison sociale" />
    ),
  },
  {
    accessorKey: 'siret',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="SIRET" />
    ),
    cell: ({ row }) => (
      <span className="font-mono text-xs whitespace-nowrap">
        {row.original.siret}
      </span>
    ),
  },
  {
    accessorKey: 'est_defaut',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Défaut" />
    ),
    cell: ({ row }) => (row.original.est_defaut ? 'Oui' : '-'),
  },
  {
    accessorKey: 'actif',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Active" />
    ),
    cell: ({ row }) => (row.original.actif ? 'Oui' : 'Archivée'),
  },
  {
    accessorKey: 'odoo_company_id',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Odoo" />
    ),
    cell: ({ row }) => (
      <span className="text-xs whitespace-nowrap">
        {row.original.odoo_company_id
          ? `company=${row.original.odoo_company_id}`
          : 'Non configuré'}
      </span>
    ),
  },
  {
    id: 'actions',
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <Link
        href={`/admin/parametres/societes-emettrices/${row.original.id}`}
        className="text-primary hover:underline"
      >
        Modifier
      </Link>
    ),
  },
];

export function SocietesEmettricesTable({
  societes,
}: {
  societes: SocieteEmettriceRow[];
}) {
  return (
    <DataTable
      columns={columns}
      data={societes}
      searchPlaceholder="Rechercher une société..."
      paginationMode="auto"
      emptyMessage="Aucune société émettrice."
    />
  );
}
