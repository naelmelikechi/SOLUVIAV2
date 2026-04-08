'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { getUserListData } from '@/lib/mock-data';
import { DataTable } from '@/components/shared/data-table';
import { userListColumns } from '@/components/admin/user-list-columns';
import { InviteUserDialog } from '@/components/admin/invite-user-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';

export default function UtilisateursPage() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const data = getUserListData();

  return (
    <div>
      <PageHeader title="Utilisateurs" description="Gestion des utilisateurs">
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="size-4" />
          Inviter un utilisateur
        </Button>
      </PageHeader>

      <DataTable
        columns={userListColumns}
        data={data}
        searchKey="email"
        searchPlaceholder="Rechercher par email..."
      />

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
