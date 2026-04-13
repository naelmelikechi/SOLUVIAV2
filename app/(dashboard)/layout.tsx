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
  const [user, setUser] = useState<{
    nom: string;
    prenom: string;
    role: string;
  } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      if (authUser) {
        supabase
          .from('users')
          .select('nom, prenom, role')
          .eq('id', authUser.id)
          .single()
          .then(({ data }) => setUser(data));
      }
    });
  }, []);

  return (
    <div
      className="grid min-h-screen"
      style={{
        gridTemplateColumns: sidebarCollapsed ? '64px 1fr' : '260px 1fr',
        gridTemplateRows: '56px 1fr',
      }}
    >
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        user={user}
      />
      <Topbar />
      <main className="bg-background overflow-y-auto p-6">{children}</main>
      <CommandPalette />
    </div>
  );
}
