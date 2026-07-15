import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/queries/users';
import { planeConfigured } from '@/lib/plane/client';
import {
  getPlaneMembers,
  getPlaneProjectsList,
  getPlaneTasksForEmail,
} from '@/lib/plane/queries';
import { PageHeader } from '@/components/shared/page-header';
import { TachesPageClient } from '@/components/taches/taches-page-client';

export const metadata: Metadata = { title: 'Tâches - SOLUVIA' };
export const revalidate = 0;

// Mes tâches transverses (Plane) en pleine page : liste des issues ouvertes
// qui me sont assignées + création de tâches poussées vers Plane via l'API.
export default async function TachesPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  if (!planeConfigured()) {
    return (
      <div>
        <PageHeader
          title="Tâches"
          description="Tâches transverses synchronisées avec Plane."
        />
        <p className="text-muted-foreground text-sm">
          Plane n&apos;est pas configuré sur cet environnement (variables
          PLANE_API_URL / PLANE_WORKSPACE / PLANE_API_KEY absentes).
        </p>
      </div>
    );
  }

  const [tasks, projects, members] = await Promise.all([
    getPlaneTasksForEmail(user.email),
    getPlaneProjectsList(),
    getPlaneMembers(),
  ]);

  const currentMemberId =
    members?.find((m) => m.email.toLowerCase() === user.email.toLowerCase())
      ?.id ?? null;

  return (
    <TachesPageClient
      tasks={tasks ?? []}
      projects={projects ?? []}
      members={members ?? []}
      currentMemberId={currentMemberId}
    />
  );
}
