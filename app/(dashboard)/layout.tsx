import { redirect } from 'next/navigation';
import {
  getCurrentUser,
  getCurrentUserActiveProjetsCount,
} from '@/lib/queries/users';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import {
  deriveCollabStatus,
  isUnassignedCollab,
} from '@/lib/utils/collab-status';

/**
 * Server Component layout (sprint 5 #3).
 *
 * Avant : layout 'use client' + auth fetchee dans useEffect, ce qui :
 *   - laissait passer un acces sans session (proxy ne valide que la
 *     presence du cookie, pas sa validite)
 *   - flashait une UI vide pendant le round-trip getUser/users.select
 *   - faisait 2-3 round-trips DB par navigation (re-mount du layout)
 *
 * Apres : auth + fetch user faits server-side. Si pas de session valide,
 * redirect vers /login. Le user est passe en props a DashboardShell qui
 * conserve uniquement l etat UI (sidebar collapse, mobile menu).
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, projetsCount] = await Promise.all([
    getCurrentUser(),
    getCurrentUserActiveProjetsCount(),
  ]);

  if (!user) {
    redirect('/login');
  }

  const collabStatus = deriveCollabStatus(
    user.role,
    user.pipeline_access,
    projetsCount,
  );
  const showUnassignedBanner = isUnassignedCollab(collabStatus);

  return (
    <DashboardShell
      user={{
        nom: user.nom ?? '',
        prenom: user.prenom ?? '',
        role: user.role ?? '',
        email: user.email ?? '',
        avatar_mode: user.avatar_mode,
        avatar_seed: user.avatar_seed ?? null,
        avatar_regen_date: user.avatar_regen_date ?? null,
        pipeline_access: user.pipeline_access,
        can_validate_ideas: user.can_validate_ideas,
        can_ship_ideas: user.can_ship_ideas,
        onboarding_completed_at: user.onboarding_completed_at ?? null,
      }}
      showUnassignedBanner={showUnassignedBanner}
    >
      {children}
    </DashboardShell>
  );
}
