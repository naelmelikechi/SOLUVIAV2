import { redirect } from 'next/navigation';
import '@/app/crm/crm-theme.css';
import { getUser } from '@/lib/queries/users';
import { canAccessPipeline, isAdmin } from '@/lib/utils/roles';
import { Sidebar } from '@/components/crm/layout/sidebar';
import { Topbar } from '@/components/crm/layout/topbar';
import {
  listMyNotifications,
  countMyUnread,
} from '@/lib/crm/queries/notifications';

// Coquille CRM : reproduit `perf/app/(app)/layout.tsx` mais gate sur l'auth
// SOLUVIA (`getUser` + rôles). Pose `data-crm` sur le conteneur racine pour
// scoper le thème perf (`crm-theme.css`). Le ThemeProvider + Toaster sont
// portés par le layout racine SOLUVIA — on n'en remonte pas un second ici.
export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect('/login');
  if (!canAccessPipeline(user.role, user.pipeline_access)) redirect('/accueil');
  const admin = isAdmin(user.role);
  const [notifications, unread] = await Promise.all([
    listMyNotifications(),
    countMyUnread(),
  ]);
  return (
    <div data-crm className="flex min-h-screen">
      <Sidebar isAdmin={admin} />
      <div className="flex flex-1 flex-col">
        <Topbar
          profile={{
            nom_complet:
              [user.prenom, user.nom].filter(Boolean).join(' ') || null,
            email: user.email,
            avatar_url: null,
            role: admin ? 'admin' : 'membre',
          }}
          notifications={notifications}
          unread={unread}
          isAdmin={admin}
        />
        <main className="flex-1 overflow-auto p-6 pb-24">{children}</main>
      </div>
    </div>
  );
}
