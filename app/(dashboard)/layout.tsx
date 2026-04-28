'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { CommandPalette } from '@/components/shared/command-palette';
import { OnboardingDialog } from '@/components/shared/onboarding';
import { UnassignedBanner } from '@/components/layout/unassigned-banner';
import { useBadgeCounts } from '@/hooks/use-badge-counts';
import {
  deriveCollabStatus,
  isUnassignedCollab,
} from '@/lib/utils/collab-status';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const badgeCounts = useBadgeCounts();
  const [user, setUser] = useState<{
    nom: string;
    prenom: string;
    role: string;
    email: string;
    avatar_mode: 'daily' | 'random' | 'frozen' | null;
    avatar_seed: string | null;
    avatar_regen_date: string | null;
    pipeline_access: boolean;
    can_validate_ideas: boolean;
    can_ship_ideas: boolean;
  } | null>(null);
  const [projetsCount, setProjetsCount] = useState<number | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user: authUser } }) => {
      if (!authUser) return;

      // Full select - requires migration 00041 (avatar_mode). Fall back to the
      // legacy schema so the sidebar still renders if the column is missing.
      const full = await supabase
        .from('users')
        .select(
          'nom, prenom, role, email, avatar_mode, avatar_seed, avatar_regen_date, pipeline_access, can_validate_ideas, can_ship_ideas',
        )
        .eq('id', authUser.id)
        .single();

      if (full.data) {
        setUser({
          ...full.data,
          avatar_mode: full.data.avatar_mode as
            | 'daily'
            | 'random'
            | 'frozen'
            | null,
          pipeline_access: full.data.pipeline_access ?? false,
          can_validate_ideas: full.data.can_validate_ideas ?? false,
          can_ship_ideas: full.data.can_ship_ideas ?? false,
        });
      } else {
        const legacy = await supabase
          .from('users')
          .select('nom, prenom, role, email, avatar_seed, avatar_regen_date')
          .eq('id', authUser.id)
          .single();

        if (legacy.data) {
          setUser({
            ...legacy.data,
            avatar_mode: null,
            pipeline_access: false,
            can_validate_ideas: false,
            can_ship_ideas: false,
          });
        }
      }

      // Compte les projets clients (non internes) ou l user est cdp ou backup
      // pour deriver son statut (unassigned_collaborator).
      const { count } = await supabase
        .from('projets')
        .select('id', { count: 'exact', head: true })
        .eq('archive', false)
        .eq('est_interne', false)
        .or(`cdp_id.eq.${authUser.id},backup_cdp_id.eq.${authUser.id}`);
      setProjetsCount(count ?? 0);
    });
  }, []);

  const collabStatus =
    user && projetsCount !== null
      ? deriveCollabStatus(user.role, user.pipeline_access, projetsCount)
      : null;
  const showUnassignedBanner =
    collabStatus !== null && isUnassignedCollab(collabStatus);

  return (
    <div className="flex h-screen">
      {/* Desktop sidebar - hidden on mobile */}
      <div className="hidden md:block">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          user={user}
          isUnassigned={showUnassignedBanner}
          badgeCounts={badgeCounts}
        />
      </div>

      {/* Right column: topbar + main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onHamburgerClick={() => setMobileOpen(true)}
          badgeCounts={badgeCounts}
        />
        <UnassignedBanner visible={showUnassignedBanner} />
        <main className="bg-background animate-in fade-in flex-1 overflow-y-auto p-4 duration-200 md:p-6">
          {children}
        </main>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Fermer le menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          {/* Sidebar panel */}
          <div className="relative h-full w-[280px] shadow-xl">
            <Sidebar
              collapsed={false}
              onToggle={() => setMobileOpen(false)}
              user={user}
              isUnassigned={showUnassignedBanner}
              mobile
              onClose={() => setMobileOpen(false)}
              badgeCounts={badgeCounts}
            />
          </div>
        </div>
      )}

      <CommandPalette />
      <OnboardingDialog />
    </div>
  );
}
