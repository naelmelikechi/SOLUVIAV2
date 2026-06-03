import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-variants';
import { PageHeader } from '@/components/shared/page-header';
import { getUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { listSocietesEmettrices } from '@/lib/queries/societes-emettrices';

export const metadata: Metadata = { title: 'Sociétés émettrices - SOLUVIA' };

export default async function SocietesEmettricesPage() {
  const [user, societes] = await Promise.all([
    getUser(),
    listSocietesEmettrices(),
  ]);
  if (!isAdmin(user?.role)) redirect('/projets');

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Sociétés émettrices"
        description="Entités juridiques qui émettent devis et factures"
      >
        <Link
          href="/admin/parametres/societes-emettrices/nouvelle"
          className={buttonVariants()}
        >
          <Plus className="size-4" />
          Nouvelle société
        </Link>
      </PageHeader>

      <div className="bg-card overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b text-left">
            <tr>
              <th className="px-4 py-2 whitespace-nowrap">Code</th>
              <th className="px-4 py-2 whitespace-nowrap">Raison sociale</th>
              <th className="px-4 py-2 whitespace-nowrap">SIRET</th>
              <th className="px-4 py-2 whitespace-nowrap">Défaut</th>
              <th className="px-4 py-2 whitespace-nowrap">Active</th>
              <th className="px-4 py-2 whitespace-nowrap">Odoo</th>
              <th className="px-4 py-2" aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {societes.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="px-4 py-2 font-mono font-semibold">{s.code}</td>
                <td className="px-4 py-2">{s.raison_sociale}</td>
                <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                  {s.siret}
                </td>
                <td className="px-4 py-2">{s.est_defaut ? 'Oui' : '-'}</td>
                <td className="px-4 py-2">{s.actif ? 'Oui' : 'Archivée'}</td>
                <td className="px-4 py-2 text-xs whitespace-nowrap">
                  {s.odoo_company_id
                    ? `company=${s.odoo_company_id}`
                    : 'Non configuré'}
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
