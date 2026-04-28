import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getCurrentUser } from '@/lib/queries/users';
import { getMyPasskeys } from '@/lib/queries/passkeys';
import { PageHeader } from '@/components/shared/page-header';
import { SettingsPageClient } from '@/components/settings/settings-page-client';
import { PasskeysSection } from '@/components/settings/passkeys-section';

export const metadata: Metadata = { title: 'Mon compte - SOLUVIA' };

export default async function ParametresComptePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const passkeys = await getMyPasskeys();

  return (
    <div>
      <Link
        href="/dashboard"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour
      </Link>
      <PageHeader
        title="Mon compte"
        description="Gérez votre profil, mot de passe et préférences"
      />
      <SettingsPageClient
        user={user}
        passkeysSection={<PasskeysSection passkeys={passkeys} />}
      />
    </div>
  );
}
