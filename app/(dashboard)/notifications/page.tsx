import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getNotifications } from '@/lib/queries/notifications';
import { PageHeader } from '@/components/shared/page-header';
import { NotificationsPageClient } from '@/components/notifications/notifications-page-client';

export const metadata: Metadata = { title: 'Notifications - SOLUVIA' };

export default async function NotificationsPage() {
  const notifications = await getNotifications();

  return (
    <div>
      <Link
        href="/dashboard"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour
      </Link>
      <PageHeader title="Notifications" description="Vos alertes et rappels" />
      <NotificationsPageClient notifications={notifications} />
    </div>
  );
}
