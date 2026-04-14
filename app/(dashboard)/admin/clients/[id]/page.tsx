import { notFound } from 'next/navigation';
import {
  getClientById,
  getProjetsByClientId,
  getContactsByClientId,
  getNotesByClientId,
  getDocumentsByClientId,
  getClientApiKeys,
} from '@/lib/queries/clients';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { ProjectRef } from '@/components/shared/project-ref';
import { formatDate } from '@/lib/utils/formatters';
import {
  STATUT_PROJET_LABELS,
  STATUT_PROJET_COLORS,
} from '@/lib/utils/constants';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FileText, FolderOpen } from 'lucide-react';
import { ClientDetailActions } from '@/components/admin/client-detail-actions';
import { ClientContactsSection } from '@/components/admin/client-contacts-section';
import { ClientNotesSection } from '@/components/admin/client-notes-section';
import { ClientApiKeysSection } from '@/components/admin/client-api-keys-section';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClientById(id);

  if (!client) {
    notFound();
  }

  const [projets, contacts, notes, documents, apiKeys] = await Promise.all([
    getProjetsByClientId(id),
    getContactsByClientId(id),
    getNotesByClientId(id),
    getDocumentsByClientId(id),
    getClientApiKeys(id),
  ]);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-primary inline-block rounded bg-[var(--primary-bg)] px-2.5 py-1 font-mono text-sm font-bold">
              {client.trigramme}
            </span>
            <h1 className="text-2xl font-semibold">{client.raison_sociale}</h1>
          </div>
          {client.siret && (
            <p className="text-muted-foreground mt-1 font-mono text-sm">
              SIRET {client.siret}
            </p>
          )}
        </div>
        <ClientDetailActions client={client} />
      </div>

      {/* Info Card */}
      <Card className="mb-6 p-6">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4" /> Informations
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
          <div>
            <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              Adresse
            </div>
            <div className="mt-1">{client.adresse || '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              Localisation
            </div>
            <div className="mt-1">{client.localisation || '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              N° Qualiopi
            </div>
            <div className="mt-1 font-mono">
              {client.numero_qualiopi || '—'}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              N° NDA
            </div>
            <div className="mt-1 font-mono">{client.numero_nda || '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              N° UAI
            </div>
            <div className="mt-1 font-mono">{client.numero_uai || '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              Date d&apos;entr&eacute;e
            </div>
            <div className="mt-1">
              {client.date_entree ? formatDate(client.date_entree) : '—'}
            </div>
          </div>
        </div>
      </Card>

      {/* Contacts */}
      <ClientContactsSection clientId={id} contacts={contacts} />

      {/* Clés API Eduvia */}
      <ClientApiKeysSection clientId={id} apiKeys={apiKeys} />

      {/* Projets associes */}
      <Card className="mb-6 p-6">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <FolderOpen className="h-4 w-4" /> Projets associés
          <span className="text-muted-foreground text-xs font-normal">
            ({projets.length})
          </span>
        </h3>
        {projets.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucun projet</p>
        ) : (
          <div className="border-border overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref</TableHead>
                  <TableHead>Typologie</TableHead>
                  <TableHead>CDP</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projets.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <ProjectRef ref_={p.ref ?? ''} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.typologie?.libelle ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.cdp ? `${p.cdp.prenom} ${p.cdp.nom}` : '—'}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {p.taux_commission}%
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={STATUT_PROJET_LABELS[p.statut] || p.statut}
                        color={STATUT_PROJET_COLORS[p.statut] || 'gray'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Notes */}
      <ClientNotesSection clientId={id} notes={notes} />

      {/* Documents */}
      <Card className="p-6">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4" /> Documents
        </h3>
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
                        label={doc.type_document ?? '—'}
                        color="gray"
                      />
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {formatDate(doc.created_at)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {doc.user ? `${doc.user.prenom} ${doc.user.nom}` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
