import { getNotifications } from '@/lib/queries/notifications';
import { PageHeader } from '@/components/shared/page-header';
import { NotificationsPageClient } from '@/components/notifications/notifications-page-client';

export default async function NotificationsPage() {
  const notifications = await getNotifications();

  return (
    <div>
      <PageHeader title="Notifications" description="Vos alertes et rappels" />
      <NotificationsPageClient notifications={notifications} />
    </div>
  );
}
