'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import {
  AlertTriangle,
  Clock,
  Timer,
  Calendar,
  AlertCircle,
  CheckCheck,
  Trash2,
  BellOff,
} from 'lucide-react';
import type { NotificationItem } from '@/lib/queries/notifications';
import {
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from '@/lib/actions/notifications';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Icon mapping
// ---------------------------------------------------------------------------

const iconMap: Record<string, React.ElementType> = {
  facture_retard: AlertTriangle,
  tache_retard: Clock,
  rappel_temps: Timer,
  periode_facturation: Calendar,
  erreur_sync: AlertCircle,
};

const iconColorMap: Record<string, string> = {
  facture_retard: 'text-red-500',
  tache_retard: 'text-orange-500',
  rappel_temps: 'text-blue-500',
  periode_facturation: 'text-violet-500',
  erreur_sync: 'text-red-400',
};

// ---------------------------------------------------------------------------
// Time ago helper
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;

  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH}h`;

  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'Hier';
  if (diffD < 30) return `Il y a ${diffD} jours`;

  const diffM = Math.floor(diffD / 30);
  if (diffM < 12) return `Il y a ${diffM} mois`;

  return `Il y a ${Math.floor(diffM / 12)} ans`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface NotificationsPageClientProps {
  notifications: NotificationItem[];
}

export function NotificationsPageClient({
  notifications,
}: NotificationsPageClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const hasUnread = notifications.some((n) => !n.read_at);

  const handleMarkRead = (id: string) => {
    startTransition(async () => {
      await markNotificationRead(id);
      router.refresh();
    });
  };

  const handleMarkAllRead = () => {
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteNotification(id);
      router.refresh();
    });
  };

  const handleNavigate = (notification: NotificationItem) => {
    if (!notification.read_at) {
      startTransition(async () => {
        await markNotificationRead(notification.id);
        if (notification.lien) {
          router.push(notification.lien);
        } else {
          router.refresh();
        }
      });
    } else if (notification.lien) {
      router.push(notification.lien);
    }
  };

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BellOff className="text-muted-foreground mb-4 h-12 w-12" />
        <p className="text-muted-foreground text-lg font-medium">
          Aucune notification
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          Vous serez notifié lorsque quelque chose requiert votre attention.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top bar */}
      {hasUnread && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={handleMarkAllRead}
          >
            <CheckCheck data-icon="inline-start" className="h-4 w-4" />
            Tout marquer comme lu
          </Button>
        </div>
      )}

      {/* Notification list */}
      <div className="space-y-2">
        {notifications.map((notification) => {
          const isUnread = !notification.read_at;
          const Icon = iconMap[notification.type] ?? AlertCircle;
          const iconColor =
            iconColorMap[notification.type] ?? 'text-muted-foreground';

          return (
            <div
              key={notification.id}
              className={cn(
                'bg-card ring-foreground/10 flex items-start gap-4 rounded-xl p-4 ring-1 transition-colors',
                isUnread && 'border-l-primary border-l-4',
                notification.lien && 'hover:bg-muted/50 cursor-pointer',
              )}
              onClick={() => handleNavigate(notification)}
              role={notification.lien ? 'link' : undefined}
              tabIndex={notification.lien ? 0 : undefined}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleNavigate(notification);
                }
              }}
            >
              {/* Icon */}
              <div
                className={cn(
                  'bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  iconColor,
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={cn(
                      'text-sm',
                      isUnread ? 'font-semibold' : 'font-medium',
                    )}
                  >
                    {notification.titre}
                  </p>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {timeAgo(notification.created_at)}
                  </span>
                </div>
                {notification.message && (
                  <p className="text-muted-foreground mt-0.5 text-sm">
                    {notification.message}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div
                className="flex shrink-0 items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                {isUnread && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Marquer comme lu"
                    disabled={isPending}
                    onClick={() => handleMarkRead(notification.id)}
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Supprimer"
                  disabled={isPending}
                  onClick={() => handleDelete(notification.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
