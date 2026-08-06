import { getDocumentsByProjetId, getProjetByRef } from '@/lib/queries/projets';
import { ProjetDocumentsSection } from '@/components/projets/projet-documents-section';
import { EntiteTachesSection } from '@/components/taches/entite-taches-section';
import { getUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';

/**
 * Bloc "Suivi" de la synthese : la part administrative de l'ancienne section
 * Activite (documents, taches Plane). Les RDV formateurs sont dans
 * /production. Le journal des mails envoyes arrive a un lot ulterieur, c'est
 * lui qui justifiera d'en faire un vrai panneau lateral.
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
  const [projet, user, documents] = await Promise.all([
    getProjetByRef(projetRef),
    getUser(),
    getDocumentsByProjetId(projetId),
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
      <ProjetDocumentsSection
        projetId={projetId}
        projetRef={projetRef}
        documents={documents}
      />
    </section>
  );
}
