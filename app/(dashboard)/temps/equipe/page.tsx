import type { Metadata } from 'next';
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

  // Lien retour : un seul, fourni par TeamRecapClient via PageHeader children
  return <TeamRecapClient weekDates={weekDates} initialSummary={teamSummary} />;
}
