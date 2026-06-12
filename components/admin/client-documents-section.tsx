'use client';

import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import { ClientUploadButton } from '@/components/admin/client-upload-button';
import { ClientDocumentActions } from '@/components/admin/client-document-actions';
import { formatDate } from '@/lib/utils/formatters';
import type { ClientDocument } from '@/lib/queries/clients';

interface ClientDocumentsSectionProps {
  clientId: string;
  documents: ClientDocument[];
}

export function ClientDocumentsSection({
  clientId,
  documents,
}: ClientDocumentsSectionProps) {
  const columns = useMemo<ColumnDef<ClientDocument>[]>(
    () => [
      {
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        size: 80,
        header: () => 'Actions',
        cell: ({ row }) => (
          <ClientDocumentActions
            documentId={row.original.id}
            clientId={clientId}
            storagePath={row.original.storage_path}
            fileName={row.original.nom_fichier}
            typeDocument={row.original.type_document}
          />
        ),
      },
      {
        accessorKey: 'nom_fichier',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Nom du fichier" />
        ),
        cell: ({ row }) => (
          <span className="text-primary text-sm font-medium">
            {row.original.nom_fichier}
          </span>
        ),
      },
      {
        accessorKey: 'type_document',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Type" />
        ),
        cell: ({ row }) => (
          <StatusBadge label={row.original.type_document ?? '-'} color="gray" />
        ),
      },
      {
        accessorKey: 'created_at',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Date" />
        ),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {formatDate(row.original.created_at)}
          </span>
        ),
      },
      {
        id: 'par',
        accessorFn: (d) => (d.user ? `${d.user.prenom} ${d.user.nom}` : '-'),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Par" />
        ),
        cell: ({ getValue }) => (
          <span className="text-sm">{getValue<string>()}</span>
        ),
      },
    ],
    [clientId],
  );

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="size-4" /> Documents
        </h3>
        <ClientUploadButton clientId={clientId} />
      </div>
      {documents.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun document</p>
      ) : (
        <DataTable
          columns={columns}
          data={documents}
          searchPlaceholder="Rechercher un document..."
          paginationMode="auto"
          emptyMessage="Aucun résultat."
        />
      )}
    </Card>
  );
}
