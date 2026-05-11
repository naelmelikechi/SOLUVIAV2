import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { getBugReportByRef } from '@/lib/queries/bug-reports';
import { createAdminClient } from '@/lib/supabase/admin';
import { Button } from '@/components/ui/button';
import { BugDetail } from './bug-detail';

export const metadata: Metadata = { title: 'Bug - SOLUVIA' };

export default async function BugDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) redirect('/projets');

  const { ref } = await params;
  const bug = await getBugReportByRef(ref);
  if (!bug) notFound();

  let screenshotUrl: string | null = null;
  if (bug.screenshot_path) {
    try {
      const admin = createAdminClient();
      const signed = await admin.storage
        .from('bug-screenshots')
        .createSignedUrl(bug.screenshot_path, 3600);
      screenshotUrl = signed.data?.signedUrl ?? null;
    } catch {
      screenshotUrl = null;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/bugs">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="font-mono text-lg">{bug.ref}</h1>
          <p className="text-muted-foreground text-xs">
            Signale le {new Date(bug.created_at).toLocaleString('fr-FR')} par{' '}
            {bug.user_email}
          </p>
        </div>
      </div>
      <BugDetail bug={bug} screenshotUrl={screenshotUrl} />
    </div>
  );
}
