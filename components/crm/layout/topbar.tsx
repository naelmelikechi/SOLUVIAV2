import { UserMenu } from './user-menu';
import { CommandPalette } from './command-palette';
import { MobileNav } from './mobile-nav';
import { ThemeToggle } from './theme-toggle';
import { NotificationBell } from './notification-bell';
import type { NotificationItem } from '@/lib/crm/queries/notifications';

type ProfileLite = {
  nom_complet: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string;
};

export function Topbar({
  profile,
  notifications,
  unread,
  isAdmin,
}: {
  profile: ProfileLite;
  notifications: NotificationItem[];
  unread: number;
  isAdmin: boolean;
}) {
  return (
    <header className="border-border bg-background/80 flex h-14 items-center gap-3 border-b px-4 backdrop-blur">
      <MobileNav isAdmin={isAdmin} />
      <CommandPalette isAdmin={isAdmin} />
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <NotificationBell notifications={notifications} unread={unread} />
        <UserMenu profile={profile} />
      </div>
    </header>
  );
}
