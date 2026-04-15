'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { CommandPalette } from '@/components/shared/command-palette';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<{
    nom: string;
    prenom: string;
    role: string;
    email: string;
    avatar_seed: string | null;
  } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      if (authUser) {
        supabase
          .from('users')
          .select('nom, prenom, role, email, avatar_seed')
          .eq('id', authUser.id)
          .single()
          .then(({ data }) => setUser(data));
      }
    });
  }, []);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden md:block">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          user={user}
        />
      </div>

      {/* Right column: topbar + main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onHamburgerClick={() => setMobileOpen(true)} />
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
              mobile
              onClose={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      <CommandPalette />
    </div>
  );
}
