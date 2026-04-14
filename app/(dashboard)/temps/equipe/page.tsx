import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/queries/users';
import { getWeekDates, getTeamWeekSummary } from '@/lib/queries/temps';
import { TeamRecapClient } from '@/components/temps/team-recap-client';

export const metadata: Metadata = { title: 'Temps Equipe — SOLUVIA' };

export default async function TempsEquipePage() {
  const user = await getCurrentUser();
  if (user?.role !== 'admin') {
    redirect('/temps');
  }

  const weekDates = getWeekDates(0);
  const teamSummary = await getTeamWeekSummary(weekDates);

  return <TeamRecapClient weekDates={weekDates} initialSummary={teamSummary} />;
}
