'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
      />
      <Topbar />
      <main className="bg-background overflow-y-auto p-6">{children}</main>
    </div>
  );
}
