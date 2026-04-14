import type { Metadata } from 'next';
import { getWeekDates, getSaisiesForWeek } from '@/lib/queries/temps';
import { getCurrentUser } from '@/lib/queries/users';
import { TempsPageClient } from '@/components/temps/temps-page-client';

export const metadata: Metadata = { title: 'Temps — SOLUVIA' };

export default async function TempsPage() {
  const [weekDates, user] = await Promise.all([
    Promise.resolve(getWeekDates(0)),
    getCurrentUser(),
  ]);
  const saisies = await getSaisiesForWeek(weekDates);
  const isAdmin = user?.role === 'admin';

  return (
    <TempsPageClient
      weekDates={weekDates}
      initialSaisies={saisies}
      isAdmin={isAdmin}
    />
  );
}
