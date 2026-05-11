'use client';

import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  TableSearchInput,
  filterBySearch,
} from '@/components/shared/table-search-input';
import { formatDate } from '@/lib/utils/formatters';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ProjetUploadButton } from './projet-upload-button';
import { ProjetDocumentActions } from './projet-document-actions';
import type { ProjetDocument } from '@/lib/queries/projets';

interface ProjetDocumentsSectionProps {
  projetId: string;
  projetRef: string;
  documents: ProjetDocument[];
}

export function ProjetDocumentsSection({
  projetId,
  projetRef,
  documents,
}: ProjetDocumentsSectionProps) {
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
        <ProjetUploadButton projetId={projetId} projetRef={projetRef} />
      </div>
      {documents.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun document</p>
      ) : (
        <>
          <div className="mb-3">
            <TableSearchInput
              value={search}
              onChange={setSearch}
              placeholder="Rechercher un document..."
            />
          </div>
          <div className="border-border overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Actions</TableHead>
                  <TableHead>Nom du fichier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Par</TableHead>
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
                      <TableCell>
                        <ProjetDocumentActions
                          documentId={doc.id}
                          projetRef={projetRef}
                          storagePath={doc.storage_path}
                          fileName={doc.nom_fichier}
                          typeDocument={doc.type_document}
                        />
                      </TableCell>
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
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </Card>
  );
}
