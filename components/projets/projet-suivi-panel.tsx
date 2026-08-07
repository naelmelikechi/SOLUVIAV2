import { getDocumentsByProjetId, getProjetByRef } from '@/lib/queries/projets';
import { getEmailsByProjetId } from '@/lib/queries/emails-projet';
import { ProjetDocumentsSection } from '@/components/projets/projet-documents-section';
import { ProjetEmailsListe } from '@/components/projets/projet-emails-liste';
import { EntiteTachesSection } from '@/components/taches/entite-taches-section';
import { getUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';

/**
 * Bloc "Suivi" de la synthese : la part administrative de l'ancienne section
 * Activite (documents, taches Plane) + les derniers mails echanges avec le
 * client (journal applicatif, source la plus vivante -> place au-dessus des
 * documents). Les RDV formateurs sont dans /production.
 */
export async function ProjetSuiviPanel({
  projetId,
  projetRef,
}: {
  projetId: string;
  projetRef: string;
}) {
  // getProjetByRef et getUser sont memoises (cache()) : les deux sont deja
  // resolus par le layout au moment ou ce panneau se rend.
  const projet = await getProjetByRef(projetRef);
  const [user, documents, emails] = await Promise.all([
    getUser(),
    getDocumentsByProjetId(projetId),
    projet?.client
      ? getEmailsByProjetId(projetId, projet.client.id)
      : Promise.resolve([]),
  ]);

  const userIsAdmin = isAdmin(user?.role ?? null);

  return (
    <section className="space-y-6">
      <h2 className="text-sm font-semibold">Suivi</h2>
      {projet?.client && (
        <EntiteTachesSection
          clientId={projet.client.id}
          planeProjectId={projet.client.plane_project_id}
          canEdit={userIsAdmin}
        />
      )}
      <ProjetEmailsListe emails={emails} />
      <ProjetDocumentsSection
        projetId={projetId}
        projetRef={projetRef}
        documents={documents}
      />
    </section>
  );
}
