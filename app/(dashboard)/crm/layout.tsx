import { redirect } from 'next/navigation';
import { getUser } from '@/lib/queries/users';
import { canAccessPipeline, isAdmin } from '@/lib/utils/roles';
import { CrmTabs } from '@/components/crm/layout/crm-tabs';

// Le CRM vit désormais dans le shell principal SOLUVIA (route group
// (dashboard)) : plus de sidebar/topbar/thème parallèles. Ce layout ne garde
// que le gating pipeline + la sous-nav CRM (tabs). Les notifications CRM
// passent par la cloche globale du topbar (page /notifications).
export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect('/login');
  if (!canAccessPipeline(user.role, user.pipeline_access)) redirect('/accueil');
  const admin = isAdmin(user.role);
  return (
    <div>
      <CrmTabs isAdmin={admin} />
      {children}
    </div>
  );
}
