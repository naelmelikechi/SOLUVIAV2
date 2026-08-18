'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import { RatioCell } from '@/components/indicateurs/ratio-cell';

interface Row {
  clientId: string;
  clientNom: string;
  progression: { realise: number; total: number };
  rdvFormateurs: { realise: number; total: number };
  qualite: { realise: number; total: number };
  facturation: { realise: number; total: number };
  facturesEnRetard: number;
}

// Ratio de completion pour le tri (les lignes sans volume passent en dernier).
function ratioOf(r: { realise: number; total: number }): number {
  return r.total > 0 ? r.realise / r.total : -1;
}

// Ratio en % pour la barre d'agregats (moyenne) - les lignes sans volume
// sont exclues (null) plutot que comptees a -100 %.
function ratioPct(r: { realise: number; total: number }): number | null {
  const ratio = ratioOf(r);
  return ratio < 0 ? null : ratio * 100;
}

function formatPct(value: number): string {
  return `${Math.round(value)} %`;
}

const columns: ColumnDef<Row>[] = [
  {
    accessorKey: 'clientNom',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="CFA" />
    ),
    cell: ({ row }) => (
      <span className="text-foreground font-medium">
        {row.original.clientNom}
      </span>
    ),
  },
  {
    id: 'progression',
    accessorFn: (r) => ratioOf(r.progression),
    meta: {
      label: 'Progression apprenants',
      aggregate: 'avg',
      aggregateValue: (r) => ratioPct(r.progression),
      aggregateFormat: formatPct,
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Progression apprenants" />
    ),
    cell: ({ row }) => (
      <RatioCell
        kind="progression"
        realise={row.original.progression.realise}
        total={row.original.progression.total}
      />
    ),
  },
  {
    id: 'rdv',
    accessorFn: (r) => ratioOf(r.rdvFormateurs),
    meta: {
      label: 'RDV formateurs',
      aggregate: 'avg',
      aggregateValue: (r) => ratioPct(r.rdvFormateurs),
      aggregateFormat: formatPct,
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="RDV formateurs" />
    ),
    cell: ({ row }) => (
      <RatioCell
        kind="rdv"
        realise={row.original.rdvFormateurs.realise}
        total={row.original.rdvFormateurs.total}
      />
    ),
  },
  {
    id: 'qualite',
    accessorFn: (r) => ratioOf(r.qualite),
    meta: {
      label: 'Tâches qualité',
      aggregate: 'avg',
      aggregateValue: (r) => ratioPct(r.qualite),
      aggregateFormat: formatPct,
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tâches qualité" />
    ),
    cell: ({ row }) => (
      <RatioCell
        kind="qualite"
        realise={row.original.qualite.realise}
        total={row.original.qualite.total}
      />
    ),
  },
  {
    id: 'facturation',
    accessorFn: (r) => ratioOf(r.facturation),
    meta: {
      label: 'Facturation',
      aggregate: 'avg',
      aggregateValue: (r) => ratioPct(r.facturation),
      aggregateFormat: formatPct,
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Facturation" />
    ),
    cell: ({ row }) => (
      <RatioCell
        kind="facturation"
        realise={row.original.facturation.realise}
        total={row.original.facturation.total}
        enRetard={row.original.facturesEnRetard}
      />
    ),
  },
];

export function CdpSectionTable({ rows }: { rows: Row[] }) {
  return (
    <div className="p-3">
      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Rechercher un CFA..."
        paginationMode="auto"
        emptyMessage="Aucun résultat."
      />
    </div>
  );
}
