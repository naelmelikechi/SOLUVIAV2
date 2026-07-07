'use client';
import { Calendar, dateFnsLocalizer, type View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = dateFnsLocalizer({
  format,
  parse,
  getDay,
  startOfWeek: () => startOfWeek(new Date(), { locale: fr }),
  locales: { fr },
});

type RdvItem = { id: string; titre: string; debut: string; fin: string };
type CalEvent = { id: string; title: string; start: Date; end: Date };

export function RdvCalendar({ rdv }: { rdv: RdvItem[] }) {
  const router = useRouter();
  const [view, setView] = useState<View>('month');
  const [date, setDate] = useState(new Date());
  const events = useMemo<CalEvent[]>(
    () =>
      rdv.map((r) => ({
        id: r.id,
        title: r.titre,
        start: new Date(r.debut),
        end: new Date(r.fin),
      })),
    [rdv],
  );
  return (
    <div className="border-border bg-card/50 h-[68vh] min-h-[440px] rounded-xl border p-3 md:h-[620px]">
      <Calendar<CalEvent>
        localizer={localizer}
        culture="fr"
        events={events}
        view={view}
        date={date}
        onView={setView}
        onNavigate={setDate}
        views={['month', 'week', 'agenda']}
        startAccessor="start"
        endAccessor="end"
        onSelectEvent={(e) => router.push(`/crm/rdv?rdv=${e.id}`)}
        messages={{
          today: "Aujourd'hui",
          previous: 'Précédent',
          next: 'Suivant',
          month: 'Mois',
          week: 'Semaine',
          agenda: 'Agenda',
          date: 'Date',
          time: 'Heure',
          event: 'RDV',
          noEventsInRange: 'Aucun RDV sur la période.',
        }}
      />
    </div>
  );
}
