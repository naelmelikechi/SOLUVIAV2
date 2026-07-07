'use client';
import dynamic from 'next/dynamic';

// react-big-calendar (~200 KB) + son CSS sont chargés à la demande, hors du
// bundle initial de la page RDV.
export const RdvCalendar = dynamic(
  () => import('./rdv-calendar').then((m) => m.RdvCalendar),
  {
    ssr: false,
    loading: () => (
      <div className="border-border bg-card/50 text-muted-foreground flex h-[68vh] min-h-[440px] items-center justify-center rounded-xl border text-sm md:h-[620px]">
        Chargement du calendrier…
      </div>
    ),
  },
);
