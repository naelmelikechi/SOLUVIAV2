import { redirect } from 'next/navigation';
import { getUser, getCurrentUserActiveProjetsCount } from '@/lib/queries/users';
import { createClient } from '@/lib/supabase/server';
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
    getUser(),
    getCurrentUserActiveProjetsCount(),
  ]);

  if (!user) {
    redirect('/login');
  }
  // Un user desactive (actif=false via le dialog admin) ne doit plus passer.
  // On signe out cote serveur pour clear le cookie - sinon le proxy verrait
  // toujours un cookie present et redirigerait /login -> /projets (boucle).
  if (user.actif === false) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/login?reason=disabled');
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
