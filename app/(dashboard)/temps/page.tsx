import type { Metadata } from 'next';
import { getWeekDates, getSaisiesForWeek } from '@/lib/queries/temps';
import { TempsPageClient } from '@/components/temps/temps-page-client';

export const metadata: Metadata = { title: 'Temps — SOLUVIA' };

export default async function TempsPage() {
  const weekDates = getWeekDates(0);
  const saisies = await getSaisiesForWeek(weekDates);

  return <TempsPageClient weekDates={weekDates} initialSaisies={saisies} />;
}
