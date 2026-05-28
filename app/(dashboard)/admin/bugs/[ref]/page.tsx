import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { getBugReportByRef } from '@/lib/queries/bug-reports';
import { createAdminClient } from '@/lib/supabase/admin';
import { Button } from '@/components/ui/button';
import { BugDetail } from './bug-detail';

const REPORTED_AT_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'short',
  timeStyle: 'short',
});

export const metadata: Metadata = { title: 'Bug - SOLUVIA' };

export default async function BugDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  // user + bug en parallele : independants. On paye getBugReportByRef si
  // l user n est pas admin (rare, la page est gated par la sidebar).
  const [user, bug] = await Promise.all([getUser(), getBugReportByRef(ref)]);
  if (!isAdmin(user?.role)) redirect('/projets');
  if (!bug) notFound();

  async function sign(path: string | null | undefined): Promise<string | null> {
    if (!path) return null;
    try {
      const admin = createAdminClient();
      const signed = await admin.storage
        .from('bug-screenshots')
        .createSignedUrl(path, 3600);
      return signed.data?.signedUrl ?? null;
    } catch {
      return null;
    }
  }

  // Auto = capture native de la page (nouveaux reports).
  // Extra = capture additionnelle ajoutee par l'user (paste/upload).
  // Legacy = screenshot_path d'un report pre-migration, affichage seulement
  // si aucun des deux nouveaux champs n'est rempli (sinon doublon).
  const hasAutoOrExtra = !!(
    bug.auto_screenshot_path || bug.extra_screenshot_path
  );
  const [autoScreenshotUrl, extraScreenshotUrl] = await Promise.all([
    sign(
      bug.auto_screenshot_path ?? (hasAutoOrExtra ? null : bug.screenshot_path),
    ),
    sign(bug.extra_screenshot_path),
  ]);

  // Server Component : toLocaleString sans timeZone afficherait l UTC sur
  // Vercel (workers en UTC). On force Europe/Paris pour rester coherent
  // avec la liste qui utilise Intl.DateTimeFormat({ timeZone }).
  const reportedAt = REPORTED_AT_FORMATTER.format(new Date(bug.created_at));

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
            Signalé le {reportedAt} par {bug.user_email}
          </p>
        </div>
      </div>
      <BugDetail
        bug={bug}
        autoScreenshotUrl={autoScreenshotUrl}
        extraScreenshotUrl={extraScreenshotUrl}
      />
    </div>
  );
}
