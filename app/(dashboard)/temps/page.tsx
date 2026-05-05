import type { Metadata } from 'next';
import {
  getWeekDates,
  getSaisiesForWeek,
  getCurrentUserTempsTotals,
} from '@/lib/queries/temps';
import { getCurrentUser } from '@/lib/queries/users';
import { getJoursFeries } from '@/lib/queries/parametres';
import { getAbsencesForUserAndPeriod } from '@/lib/queries/absences';
import { isAdmin } from '@/lib/utils/roles';
import { TempsPageClient } from '@/components/temps/temps-page-client';

export const metadata: Metadata = { title: 'Temps - SOLUVIA' };
export const revalidate = 120;

export default async function TempsPage() {
  const weekDates = getWeekDates(0);
  const [saisies, user, joursFeries, absences, totals] = await Promise.all([
    getSaisiesForWeek(weekDates),
    getCurrentUser(),
    getJoursFeries(new Date().getFullYear()),
    getAbsencesForUserAndPeriod(
      weekDates[0]!,
      weekDates[weekDates.length - 1]!,
    ),
    getCurrentUserTempsTotals(),
  ]);
  const adminUser = isAdmin(user?.role);
  const joursFeriesMap = Object.fromEntries(
    (joursFeries ?? []).map((jf) => [jf.date, jf.libelle]),
  );

  return (
    <TempsPageClient
      weekDates={weekDates}
      initialSaisies={saisies}
      initialAbsences={absences}
      isAdmin={adminUser}
      joursFeries={joursFeriesMap}
      totals={totals}
    />
  );
}
