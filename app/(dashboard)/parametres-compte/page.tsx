import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/queries/users';
import { PageHeader } from '@/components/shared/page-header';
import { SettingsPageClient } from '@/components/settings/settings-page-client';

export const metadata: Metadata = { title: 'Mon compte — SOLUVIA' };

export default async function ParametresComptePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  return (
    <div>
      <PageHeader
        title="Mon compte"
        description="Gérez votre profil, mot de passe et préférences"
      />
      <SettingsPageClient user={user} />
    </div>
  );
}
