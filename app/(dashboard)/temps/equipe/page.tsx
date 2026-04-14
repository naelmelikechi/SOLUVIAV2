import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { getWeekDates, getTeamWeekSummary } from '@/lib/queries/temps';
import { TeamRecapClient } from '@/components/temps/team-recap-client';

export const metadata: Metadata = { title: 'Temps Equipe — SOLUVIA' };

export default async function TempsEquipePage() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) {
    redirect('/temps');
  }

  const weekDates = getWeekDates(0);
  const teamSummary = await getTeamWeekSummary(weekDates);

  return <TeamRecapClient weekDates={weekDates} initialSummary={teamSummary} />;
}
