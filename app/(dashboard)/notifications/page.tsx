import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getNotifications } from '@/lib/queries/notifications';
import { listMyNotifications } from '@/lib/crm/queries/notifications';
import { PageHeader } from '@/components/shared/page-header';
import { NotificationsPageClient } from '@/components/notifications/notifications-page-client';

export const metadata: Metadata = { title: 'Notifications - SOLUVIA' };

export default async function NotificationsPage() {
  // Cloche unique : notifications systeme (public) + notifications CRM
  // (mentions, RDV - schema crm) dans la meme liste chronologique.
  const [notifications, crmNotifications] = await Promise.all([
    getNotifications(),
    listMyNotifications(50),
  ]);

  return (
    <div>
      <Link
        href="/accueil"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        Retour
      </Link>
      <PageHeader title="Notifications" description="Vos alertes et rappels" />
      <NotificationsPageClient
        notifications={notifications}
        crmNotifications={crmNotifications}
      />
    </div>
  );
}
