'use client';

import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  TableSearchInput,
  filterBySearch,
} from '@/components/shared/table-search-input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  const [search, setSearch] = useState('');
  const filtered = useMemo(
    () =>
      filterBySearch(documents, search, (d) =>
        [d.nom_fichier, d.type_document, d.user?.prenom, d.user?.nom]
          .filter(Boolean)
          .join(' '),
      ),
    [documents, search],
  );

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4" /> Documents
        </h3>
        <ClientUploadButton clientId={clientId} />
      </div>
      {documents.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun document</p>
      ) : (
        <div className="space-y-3">
          <TableSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Rechercher un document..."
          />
          <div className="border-border overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom du fichier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Par</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-muted-foreground h-12 text-center text-sm"
                    >
                      Aucun résultat.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="text-primary text-sm font-medium">
                        {doc.nom_fichier}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={doc.type_document ?? '-'}
                          color="gray"
                        />
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {formatDate(doc.created_at)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {doc.user ? `${doc.user.prenom} ${doc.user.nom}` : '-'}
                      </TableCell>
                      <TableCell>
                        <ClientDocumentActions
                          documentId={doc.id}
                          clientId={clientId}
                          storagePath={doc.storage_path}
                          fileName={doc.nom_fichier}
                          typeDocument={doc.type_document}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </Card>
  );
}
