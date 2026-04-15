import type { Metadata } from 'next';
import { getWeekDates, getSaisiesForWeek } from '@/lib/queries/temps';
import { getCurrentUser } from '@/lib/queries/users';
import { getJoursFeries } from '@/lib/queries/parametres';
import { isAdmin } from '@/lib/utils/roles';
import { TempsPageClient } from '@/components/temps/temps-page-client';

export const metadata: Metadata = { title: 'Temps - SOLUVIA' };
export const revalidate = 120;

export default async function TempsPage() {
  const weekDates = getWeekDates(0);
  const [saisies, user, joursFeries] = await Promise.all([
    getSaisiesForWeek(weekDates),
    getCurrentUser(),
    getJoursFeries(new Date().getFullYear()),
  ]);
  const adminUser = isAdmin(user?.role);
  const joursFeriesMap = Object.fromEntries(
    (joursFeries ?? []).map((jf) => [jf.date, jf.libelle]),
  );

  return (
    <TempsPageClient
      weekDates={weekDates}
      initialSaisies={saisies}
      isAdmin={adminUser}
      joursFeries={joursFeriesMap}
    />
  );
}
