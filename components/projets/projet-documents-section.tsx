import { FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
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
              {documents.map((doc) => (
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
                    <ProjetDocumentActions
                      documentId={doc.id}
                      projetRef={projetRef}
                      storagePath={doc.storage_path}
                      fileName={doc.nom_fichier}
                      typeDocument={doc.type_document}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
