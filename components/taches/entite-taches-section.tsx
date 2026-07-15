import { planeConfigured } from '@/lib/plane/client';
import {
  getPlaneMembers,
  getPlaneProjectsList,
  getPlaneTasksForProject,
} from '@/lib/plane/queries';
import { getUser } from '@/lib/queries/users';
import { EntiteTachesCard } from '@/components/taches/entite-taches-card';

// Wrapper serveur de la carte Tâches (Plane) d'un client : fait les fetchs
// Plane (issues du projet lié, liste des projets pour le sélecteur admin,
// membres pour la création) et ne rend rien si Plane n'est pas configuré.
// Best-effort : une erreur Plane n'affiche pas la carte plutôt que de casser
// la page.
export async function EntiteTachesSection({
  clientId,
  planeProjectId,
  canEdit,
}: {
  clientId: string;
  planeProjectId: string | null;
  canEdit: boolean;
}) {
  if (!planeConfigured()) return null;

  const [user, tasks, planeProjects, members] = await Promise.all([
    getUser(),
    planeProjectId ? getPlaneTasksForProject(planeProjectId) : null,
    getPlaneProjectsList(),
    getPlaneMembers(),
  ]);

  // Sans la liste des projets Plane on ne peut ni résoudre le projet lié ni
  // proposer le sélecteur : Plane est indisponible, on masque la carte.
  if (!planeProjects) return null;

  const currentMemberId =
    (user &&
      members?.find((m) => m.email.toLowerCase() === user.email.toLowerCase())
        ?.id) ??
    null;

  return (
    <EntiteTachesCard
      clientId={clientId}
      planeProjectId={planeProjectId}
      tasks={tasks ?? []}
      planeProjects={planeProjects}
      members={members ?? []}
      currentMemberId={currentMemberId}
      canEdit={canEdit}
    />
  );
}
