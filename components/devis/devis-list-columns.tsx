'use client';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { DevisStatusBadge } from './devis-status-badge';
import type { DevisListItem } from '@/lib/queries/devis';

export const devisColumns: ColumnDef<DevisListItem>[] = [
  {
    accessorKey: 'ref',
    header: 'Référence',
    cell: ({ row }) =>
      row.original.ref ? (
        <Link
          href={`/devis/${row.original.ref}`}
          className="font-mono font-semibold hover:underline"
        >
          {row.original.ref}
        </Link>
      ) : (
        <Link
          href={`/devis/${row.original.id}`}
          className="text-muted-foreground italic hover:underline"
        >
          brouillon
        </Link>
      ),
  },
  {
    accessorKey: 'objet',
    header: 'Objet',
    cell: ({ row }) => (
      <span className="line-clamp-1">{row.original.objet}</span>
    ),
  },
  {
    id: 'client',
    header: 'Client',
    cell: ({ row }) =>
      row.original.client
        ? `${row.original.client.trigramme} - ${row.original.client.raison_sociale}`
        : '-',
  },
  {
    id: 'societe',
    header: 'Société',
    cell: ({ row }) => row.original.societe_emettrice?.code ?? '-',
  },
  {
    accessorKey: 'statut',
    header: 'Statut',
    cell: ({ row }) => <DevisStatusBadge statut={row.original.statut} />,
  },
  {
    accessorKey: 'montant_ttc',
    header: 'Total TTC',
    cell: ({ row }) => (
      <span className="font-mono tabular-nums">
        {Number(row.original.montant_ttc).toFixed(2).replace('.', ',')} €
      </span>
    ),
  },
  {
    accessorKey: 'date_envoi',
    header: 'Envoyé le',
    cell: ({ row }) =>
      row.original.date_envoi
        ? new Date(row.original.date_envoi).toLocaleDateString('fr-FR')
        : '-',
  },
  {
    accessorKey: 'date_validite',
    header: "Valide jusqu'au",
    cell: ({ row }) =>
      row.original.date_validite
        ? new Date(row.original.date_validite).toLocaleDateString('fr-FR')
        : '-',
  },
];
