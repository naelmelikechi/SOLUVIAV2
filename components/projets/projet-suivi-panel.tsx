import { getDocumentsByProjetId, getProjetByRef } from '@/lib/queries/projets';
import { ProjetDocumentsSection } from '@/components/projets/projet-documents-section';
import { EntiteTachesSection } from '@/components/taches/entite-taches-section';
import { createClient } from '@/lib/supabase/server';
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
  const supabase = await createClient();
  const [projet, authUserRes] = await Promise.all([
    getProjetByRef(projetRef),
    supabase.auth.getUser(),
  ]);

  const authUser = authUserRes.data.user;
  const [currentUserRes, documents] = await Promise.all([
    authUser
      ? supabase.from('users').select('role').eq('id', authUser.id).single()
      : Promise.resolve({ data: null as { role: string | null } | null }),
    getDocumentsByProjetId(projetId),
  ]);

  const userIsAdmin = isAdmin(currentUserRes?.data?.role ?? null);

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
