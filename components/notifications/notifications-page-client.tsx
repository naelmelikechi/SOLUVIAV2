'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import {
  AlertTriangle,
  AtSign,
  BellRing,
  CalendarClock,
  Clock,
  Timer,
  Calendar,
  AlertCircle,
  CheckCheck,
  Trash2,
  BellOff,
  Send,
} from 'lucide-react';
import type { NotificationItem } from '@/lib/queries/notifications';
import type { NotificationItem as CrmNotificationItem } from '@/lib/crm/queries/notifications';
import {
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from '@/lib/actions/notifications';
import {
  markRead as markCrmRead,
  markAllRead as markAllCrmRead,
} from '@/lib/crm/actions/notifications';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Icon mapping
// ---------------------------------------------------------------------------

const iconMap: Record<string, React.ElementType> = {
  facture_retard: AlertTriangle,
  contrat_facturable: Send,
  tache_retard: Clock,
  rappel_temps: Timer,
  periode_facturation: Calendar,
  erreur_sync: AlertCircle,
  crm_mention: AtSign,
  crm_rdv_assigned: CalendarClock,
  crm_autre: BellRing,
};

const iconColorMap: Record<string, string> = {
  facture_retard: 'text-red-500',
  contrat_facturable: 'text-blue-500',
  tache_retard: 'text-orange-500',
  rappel_temps: 'text-blue-500',
  periode_facturation: 'text-violet-500',
  erreur_sync: 'text-red-400',
  crm_mention: 'text-purple-500',
  crm_rdv_assigned: 'text-blue-500',
  crm_autre: 'text-muted-foreground',
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
  crmNotifications?: CrmNotificationItem[];
}

/** Item unifie affichable : notifications systeme + CRM dans une seule liste. */
interface DisplayNotification {
  id: string;
  source: 'system' | 'crm';
  type: string;
  titre: string;
  message: string | null;
  lien: string | null;
  read_at: string | null;
  created_at: string;
}

export function NotificationsPageClient({
  notifications,
  crmNotifications = [],
}: NotificationsPageClientProps) {
  const { push, refresh } = useRouter();
  const [isPending, startTransition] = useTransition();

  const merged: DisplayNotification[] = [
    ...notifications.map(
      (n): DisplayNotification => ({
        id: n.id,
        source: 'system',
        type: n.type,
        titre: n.titre,
        message: n.message,
        lien: n.lien,
        read_at: n.read_at,
        created_at: n.created_at,
      }),
    ),
    ...crmNotifications.map(
      (n): DisplayNotification => ({
        id: n.id,
        source: 'crm',
        type: `crm_${n.type === 'mention' || n.type === 'rdv_assigned' ? n.type : 'autre'}`,
        titre: n.contenu,
        message: n.actor
          ? `CRM - ${n.actor.prenom ?? ''} ${n.actor.nom ?? ''}`.trim()
          : 'CRM',
        lien: n.link,
        read_at: n.lu ? n.created_at : null,
        created_at: n.created_at,
      }),
    ),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const hasUnread = merged.some((n) => !n.read_at);
  const hasCrmUnread = crmNotifications.some((n) => !n.lu);

  const markOneRead = async (notification: DisplayNotification) => {
    if (notification.source === 'crm') await markCrmRead(notification.id);
    else await markNotificationRead(notification.id);
  };

  const handleMarkRead = (notification: DisplayNotification) => {
    startTransition(async () => {
      await markOneRead(notification);
      refresh();
    });
  };

  const handleMarkAllRead = () => {
    startTransition(async () => {
      await Promise.all([
        markAllNotificationsRead(),
        hasCrmUnread ? markAllCrmRead() : Promise.resolve(),
      ]);
      refresh();
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteNotification(id);
      refresh();
    });
  };

  const handleNavigate = (notification: DisplayNotification) => {
    if (!notification.read_at) {
      startTransition(async () => {
        await markOneRead(notification);
        if (notification.lien) {
          push(notification.lien);
        } else {
          refresh();
        }
      });
    } else if (notification.lien) {
      push(notification.lien);
    }
  };

  if (merged.length === 0) {
    return (
      <EmptyState
        icon={BellOff}
        title="Aucune notification"
        description="Vous serez notifié lorsque quelque chose requiert votre attention."
      />
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
            <CheckCheck data-icon="inline-start" className="size-4" />
            Tout marquer comme lu
          </Button>
        </div>
      )}

      {/* Notification list */}
      <div className="space-y-2">
        {merged.map((notification) => {
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
              {...(notification.lien
                ? {
                    onClick: () => handleNavigate(notification),
                    role: 'link',
                    tabIndex: 0,
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleNavigate(notification);
                      }
                    },
                  }
                : {})}
            >
              {/* Icon */}
              <div
                className={cn(
                  'bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg',
                  iconColor,
                )}
              >
                <Icon className="size-[18px]" />
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
              {/* role="presentation" : conteneur visuel uniquement, le stop
                  propagation est un detail d'implementation pour eviter que
                  le clic des Buttons internes declenche la navigation parent. */}
              <div
                role="presentation"
                className="flex shrink-0 items-center gap-1"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                {isUnread && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Marquer comme lu"
                    aria-label="Marquer comme lu"
                    disabled={isPending}
                    onClick={() => handleMarkRead(notification)}
                  >
                    <CheckCheck className="size-3.5" />
                  </Button>
                )}
                {notification.source === 'system' && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Supprimer"
                    aria-label="Supprimer la notification"
                    disabled={isPending}
                    onClick={() => handleDelete(notification.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
