import { getWeekDates, getSaisiesForWeek } from '@/lib/queries/temps';
import { TempsPageClient } from '@/components/temps/temps-page-client';

export default async function TempsPage() {
  const weekDates = getWeekDates(0);
  const saisies = await getSaisiesForWeek(weekDates);

  return <TempsPageClient weekDates={weekDates} initialSaisies={saisies} />;
}
