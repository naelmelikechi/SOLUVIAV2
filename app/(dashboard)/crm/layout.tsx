import { redirect } from 'next/navigation';
import { getUser } from '@/lib/queries/users';
import { canAccessPipeline, isAdmin } from '@/lib/utils/roles';
import { CrmTabs } from '@/components/crm/layout/crm-tabs';
import { NotificationBell } from '@/components/crm/layout/notification-bell';
import {
  listMyNotifications,
  countMyUnread,
} from '@/lib/crm/queries/notifications';

// Le CRM vit désormais dans le shell principal SOLUVIA (route group
// (dashboard)) : plus de sidebar/topbar/thème parallèles. Ce layout ne garde
// que le gating pipeline + la sous-nav CRM (tabs) + la cloche CRM.
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
    <div>
      <CrmTabs
        isAdmin={admin}
        right={
          <NotificationBell notifications={notifications} unread={unread} />
        }
      />
      {children}
    </div>
  );
}
