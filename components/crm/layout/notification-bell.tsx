'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, AtSign, CalendarClock, BellRing, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Button, buttonVariants } from '@/components/crm/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/crm/ui/popover';
import { cn } from '@/lib/crm/utils';
import { markRead, markAllRead } from '@/lib/crm/actions/notifications';
import type { NotificationItem } from '@/lib/crm/queries/notifications';

function NotifIcon({ type }: { type: string }) {
  const cls = 'h-4 w-4 shrink-0 text-muted-foreground';
  if (type === 'mention') return <AtSign className={cls} />;
  if (type === 'rdv_assigned') return <CalendarClock className={cls} />;
  return <BellRing className={cls} />;
}

function relative(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: fr });
  } catch {
    return '';
  }
}

export function NotificationBell({
  notifications,
  unread,
}: {
  notifications: NotificationItem[];
  unread: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const openNotif = (n: NotificationItem) =>
    start(async () => {
      try {
        if (!n.lu) await markRead(n.id);
      } catch {
        /* best-effort */
      }
      setOpen(false);
      if (n.link) router.push(n.link);
      else router.refresh();
    });

  const allRead = () =>
    start(async () => {
      try {
        await markAllRead();
        router.refresh();
      } catch {
        /* best-effort */
      }
    });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Notifications"
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon' }),
              'relative',
            )}
          />
        }
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-border flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-7 text-xs"
              disabled={pending}
              onClick={allRead}
            >
              <Check className="mr-1 h-3 w-3" />
              Tout marquer comme lu
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="text-muted-foreground px-3 py-8 text-center text-sm">
              Aucune notification.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => openNotif(n)}
                    className={cn(
                      'hover:bg-accent/60 flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors disabled:opacity-60',
                      !n.lu && 'bg-primary/5',
                    )}
                  >
                    <NotifIcon type={n.type} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-snug">
                        {n.contenu}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block text-xs">
                        {relative(n.created_at)}
                      </span>
                    </span>
                    {!n.lu && (
                      <span
                        className="bg-primary mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        aria-label="Non lue"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
