import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { listSocietesEmettrices } from '@/lib/queries/societes-emettrices';

export const metadata: Metadata = { title: 'Societes emettrices - SOLUVIA' };

export default async function SocietesEmettricesPage() {
  const [user, societes] = await Promise.all([
    getCurrentUser(),
    listSocietesEmettrices(),
  ]);
  if (!isAdmin(user?.role)) redirect('/projets');

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Societes emettrices"
        description="Entites juridiques qui emettent devis et factures"
      >
        <Link
          href="/admin/parametres/societes-emettrices/nouvelle"
          className={buttonVariants()}
        >
          <Plus className="h-4 w-4" />
          Nouvelle societe
        </Link>
      </PageHeader>

      <div className="bg-card rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b text-left">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Raison sociale</th>
              <th className="px-4 py-2">SIRET</th>
              <th className="px-4 py-2">Defaut</th>
              <th className="px-4 py-2">Active</th>
              <th className="px-4 py-2">Odoo</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {societes.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="px-4 py-2 font-mono font-semibold">{s.code}</td>
                <td className="px-4 py-2">{s.raison_sociale}</td>
                <td className="px-4 py-2 font-mono text-xs">{s.siret}</td>
                <td className="px-4 py-2">{s.est_defaut ? 'Oui' : '-'}</td>
                <td className="px-4 py-2">{s.actif ? 'Oui' : 'Archivee'}</td>
                <td className="px-4 py-2 text-xs">
                  {s.odoo_company_id
                    ? `company=${s.odoo_company_id}`
                    : 'Non configure'}
                </td>
                <td className="px-4 py-2">
                  <Link
                    href={`/admin/parametres/societes-emettrices/${s.id}`}
                    className="text-primary hover:underline"
                  >
                    Modifier
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
