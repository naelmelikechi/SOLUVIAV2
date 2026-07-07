'use client';
import Link from 'next/link';
import { Avatar, AvatarFallback } from '@/components/crm/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/crm/ui/dropdown-menu';

export function UserMenu({
  profile,
}: {
  profile: { nom_complet: string | null; email: string | null; role: string };
}) {
  const initials = (profile.nom_complet ?? profile.email ?? '?')
    .slice(0, 2)
    .toUpperCase();
  const isAdmin = profile.role === 'admin';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="outline-none">
        <Avatar className="h-8 w-8">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-2 py-1.5">
          <p className="text-sm">{profile.nom_complet ?? profile.email}</p>
          <p className="text-muted-foreground text-xs">
            {isAdmin ? 'Administrateur' : 'Membre'}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/parametres-compte" />}>
          Mon compte
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem render={<Link href="/admin/utilisateurs" />}>
            Utilisateurs
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => window.location.assign('/api/auth/logout')}
        >
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
