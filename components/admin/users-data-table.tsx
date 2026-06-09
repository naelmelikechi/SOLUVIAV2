'use client';

import { useState, useMemo } from 'react';
import { Download, UserPlus } from 'lucide-react';
import type { UserListItem } from '@/lib/queries/users';
import type { EmployeeCostDefaults } from '@/lib/utils/employee-cost';
import { DataTable } from '@/components/shared/data-table';
import { getUserListColumns } from '@/components/admin/user-list-columns';
import { InviteUserDialog } from '@/components/admin/invite-user-dialog';
import { UserEditDialog } from '@/components/admin/user-edit-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { formatDateLong } from '@/lib/utils/formatters';

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  cdp: 'CDP',
  commercial: 'Commercial',
};

export function UsersDataTable({
  data,
  callerRole,
  costDefaults,
}: {
  data: UserListItem[];
  callerRole?: string;
  costDefaults: EmployeeCostDefaults;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserListItem | null>(null);

  const columns = useMemo(
    () => getUserListColumns((user) => setEditUser(user)),
    [],
  );

  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const rows = data.map((u) => ({
      Nom: u.nom,
      Prénom: u.prenom,
      Email: u.email,
      Rôle: ROLE_LABELS[u.role] || u.role,
      'Projets assignés': u.projets_count,
      Statut: u.actif ? 'Actif' : 'Inactif',
      'Dernière connexion': u.derniere_connexion
        ? formatDateLong(u.derniere_connexion)
        : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Utilisateurs');
    XLSX.writeFile(
      wb,
      `utilisateurs_export_${new Date().toISOString().split('T')[0]}.xlsx`,
    );
  };

  return (
    <div>
      <PageHeader title="Utilisateurs" description="Gestion des utilisateurs">
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="size-4" />
          Inviter un utilisateur
        </Button>
      </PageHeader>

      <div className="mb-4 flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1.5 size-4" />
          Export Excel
        </Button>
      </div>

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
        callerRole={callerRole}
        costDefaults={costDefaults}
        open={!!editUser}
        onOpenChange={(open) => {
          if (!open) setEditUser(null);
        }}
      />
    </div>
  );
}
