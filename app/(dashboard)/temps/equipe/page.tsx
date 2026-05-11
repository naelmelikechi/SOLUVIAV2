import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { getWeekDates, getTeamWeekSummary } from '@/lib/queries/temps';
import { TeamRecapClient } from '@/components/temps/team-recap-client';

export const metadata: Metadata = { title: 'Temps Équipe - SOLUVIA' };

export default async function TempsEquipePage() {
  const weekDates = getWeekDates(0);
  // user + teamSummary en parallele. Si non-admin on paye teamSummary
  // pour rien (cas rare : sidebar gate).
  const [user, teamSummary] = await Promise.all([
    getCurrentUser(),
    getTeamWeekSummary(weekDates),
  ]);
  if (!isAdmin(user?.role)) {
    redirect('/temps');
  }

  return (
    <div>
      <Link
        href="/temps"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour à ma semaine
      </Link>
      <TeamRecapClient weekDates={weekDates} initialSummary={teamSummary} />
    </div>
  );
}
