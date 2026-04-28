import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  getClientById,
  getProjetsByClientId,
  getContactsByClientId,
  getNotesByClientId,
  getDocumentsByClientId,
  getClientApiKeys,
} from '@/lib/queries/clients';
import { getCurrentUser, getActiveUsersMinimal } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { ArrowLeft, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils/formatters';
import { ClientDetailActions } from '@/components/admin/client-detail-actions';
import { ClientContactsSection } from '@/components/admin/client-contacts-section';
import { ClientNotesSection } from '@/components/admin/client-notes-section';
import { ClientApiKeysSection } from '@/components/admin/client-api-keys-section';
import { ClientApporteurSection } from '@/components/admin/client-apporteur-section';
import { ClientProjetsSection } from '@/components/admin/client-projets-section';
import { ClientDocumentsSection } from '@/components/admin/client-documents-section';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!isAdmin(currentUser?.role)) {
    redirect('/projets');
  }

  const { id } = await params;
  const client = await getClientById(id);

  if (!client) {
    notFound();
  }

  const [projets, contacts, notes, documents, apiKeys, users] =
    await Promise.all([
      getProjetsByClientId(id),
      getContactsByClientId(id),
      getNotesByClientId(id),
      getDocumentsByClientId(id),
      getClientApiKeys(id),
      getActiveUsersMinimal(),
    ]);

  return (
    <div>
      <Link
        href="/admin/clients"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux clients
      </Link>

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
            <div className="mt-1">{client.adresse || '-'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              Localisation
            </div>
            <div className="mt-1">{client.localisation || '-'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              N° Qualiopi
            </div>
            <div className="mt-1 font-mono">
              {client.numero_qualiopi || '-'}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              N° NDA
            </div>
            <div className="mt-1 font-mono">{client.numero_nda || '-'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              N° UAI
            </div>
            <div className="mt-1 font-mono">{client.numero_uai || '-'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              Date d&apos;entr&eacute;e
            </div>
            <div className="mt-1">
              {client.date_entree ? formatDate(client.date_entree) : '-'}
            </div>
          </div>
        </div>
      </Card>

      {/* Apporteur commercial */}
      <ClientApporteurSection
        clientId={id}
        apporteur={client.apporteur}
        apporteurDate={client.apporteur_date}
        users={users}
      />

      {/* Contacts */}
      <ClientContactsSection clientId={id} contacts={contacts} />

      {/* Clés API Eduvia */}
      <ClientApiKeysSection clientId={id} apiKeys={apiKeys} />

      {/* Projets associes */}
      <ClientProjetsSection projets={projets} />

      {/* Notes */}
      <ClientNotesSection clientId={id} notes={notes} />

      {/* Documents */}
      <ClientDocumentsSection clientId={id} documents={documents} />
    </div>
  );
}
