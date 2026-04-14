import type { Metadata } from 'next';
import { getWeekDates, getSaisiesForWeek } from '@/lib/queries/temps';
import { getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { TempsPageClient } from '@/components/temps/temps-page-client';

export const metadata: Metadata = { title: 'Temps — SOLUVIA' };
export const revalidate = 120;

export default async function TempsPage() {
  const [weekDates, user] = await Promise.all([
    Promise.resolve(getWeekDates(0)),
    getCurrentUser(),
  ]);
  const saisies = await getSaisiesForWeek(weekDates);
  const adminUser = isAdmin(user?.role);

  return (
    <TempsPageClient
      weekDates={weekDates}
      initialSaisies={saisies}
      isAdmin={adminUser}
    />
  );
}
