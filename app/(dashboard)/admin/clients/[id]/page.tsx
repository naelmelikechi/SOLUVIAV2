import { notFound } from 'next/navigation';
import {
  getClientById,
  getProjetsByClientId,
  getContactsByClientId,
  getNotesByClientId,
  getDocumentsByClientId,
} from '@/lib/mock-data';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { ProjectRef } from '@/components/shared/project-ref';
import { formatDate, formatDateLong } from '@/lib/utils/formatters';
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
import { FileText, MessageSquare, Users, FolderOpen } from 'lucide-react';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = getClientById(id);

  if (!client) {
    notFound();
  }

  const projets = getProjetsByClientId(id);
  const contacts = getContactsByClientId(id);
  const notes = getNotesByClientId(id);
  const documents = getDocumentsByClientId(id);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
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
            <div className="mt-1 font-mono">—</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              N° NDA
            </div>
            <div className="mt-1 font-mono">—</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              N° UAI
            </div>
            <div className="mt-1 font-mono">—</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              Date d&apos;entrée
            </div>
            <div className="mt-1">—</div>
          </div>
        </div>
      </Card>

      {/* Contacts */}
      <Card className="mb-6 p-6">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4" /> Contacts
        </h3>
        {contacts.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucun contact</p>
        ) : (
          <div className="border-border overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Poste</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Téléphone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm font-medium">
                      {c.nom}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {c.poste}
                    </TableCell>
                    <TableCell className="text-sm">{c.email}</TableCell>
                    <TableCell className="text-sm">{c.telephone}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

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
                  <TableHead>Contrats</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projets.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <ProjectRef ref_={p.ref} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.typologie.libelle}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.cdp.prenom} {p.cdp.nom}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {p.apprentis_actifs}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={STATUT_PROJET_LABELS[p.statut]}
                        color={STATUT_PROJET_COLORS[p.statut]}
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
      <Card className="mb-6 p-6">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <MessageSquare className="h-4 w-4" /> Historique / Notes
        </h3>
        {notes.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune note</p>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => (
              <div key={note.id} className="border-primary/30 border-l-2 pl-4">
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  <span>{formatDateLong(note.created_at)}</span>
                  <span>—</span>
                  <span className="font-medium">
                    {note.user.prenom} {note.user.nom}
                  </span>
                  <StatusBadge
                    label={note.user.role === 'admin' ? 'Admin' : 'CDP'}
                    color={note.user.role === 'admin' ? 'purple' : 'blue'}
                  />
                </div>
                <p className="mt-1 text-sm">{note.contenu}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

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
                      <StatusBadge label={doc.type_document} color="gray" />
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {formatDate(doc.created_at)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {doc.user.prenom} {doc.user.nom}
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
