'use client';

import { useState, useMemo } from 'react';
import { UserPlus } from 'lucide-react';
import type { UserListItem } from '@/lib/queries/users';
import { DataTable } from '@/components/shared/data-table';
import { getUserListColumns } from '@/components/admin/user-list-columns';
import { InviteUserDialog } from '@/components/admin/invite-user-dialog';
import { UserEditDialog } from '@/components/admin/user-edit-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';

export function UsersDataTable({ data }: { data: UserListItem[] }) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserListItem | null>(null);

  const columns = useMemo(
    () => getUserListColumns((user) => setEditUser(user)),
    [],
  );

  return (
    <div>
      <PageHeader title="Utilisateurs" description="Gestion des utilisateurs">
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="size-4" />
          Inviter un utilisateur
        </Button>
      </PageHeader>

      <DataTable
        columns={columns}
        data={data}
        searchKey="email"
        searchPlaceholder="Rechercher par email..."
        defaultSort={{ id: 'nom', desc: false }}
      />

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <UserEditDialog
        user={editUser}
        open={!!editUser}
        onOpenChange={(open) => {
          if (!open) setEditUser(null);
        }}
      />
    </div>
  );
}
