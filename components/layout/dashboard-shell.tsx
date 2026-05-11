'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { CommandPalette } from '@/components/shared/command-palette';
import { OnboardingTour } from '@/components/onboarding/onboarding-tour';
import { UnassignedBanner } from '@/components/layout/unassigned-banner';
import { BugReportLauncher } from '@/components/bug-report/bug-report-launcher';
import { useBadgeCounts } from '@/hooks/use-badge-counts';

/**
 * Forme exacte attendue par <Sidebar>. Le layout server-side construit cet
 * objet depuis getCurrentUser() pour eviter le double round-trip cote client
 * qu il y avait avant le sprint 5 #3.
 */
export interface DashboardShellUser {
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
  onboarding_completed_at: string | null;
}

interface DashboardShellProps {
  user: DashboardShellUser;
  showUnassignedBanner: boolean;
  children: React.ReactNode;
}

/**
 * Coquille UI client : owns sidebarCollapsed / mobileOpen et consomme les
 * badge counts realtime. Recoit le user pre-fetch cote serveur pour eviter
 * le flash de UI vide qu'on avait quand le useEffect couraît dans le layout.
 */
export function DashboardShell({
  user,
  showUnassignedBanner,
  children,
}: DashboardShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const badgeCounts = useBadgeCounts();

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
        <main
          id="main-content"
          className="bg-background animate-in fade-in flex-1 overflow-y-auto p-4 duration-200 md:p-6"
        >
          {children}
        </main>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Fermer le menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
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
      <OnboardingTour
        role={user.role}
        completedAt={user.onboarding_completed_at}
      />
      <BugReportLauncher />
    </div>
  );
}
