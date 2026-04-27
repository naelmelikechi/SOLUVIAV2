'use client';

import { format, parseISO, isWeekend } from 'date-fns';
import { fr } from 'date-fns/locale';
import { BriefcaseBusiness } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import type { AbsenceDayInfo, AbsencePeriod } from '@/lib/utils/absences';

const ABSENCE_LABEL: Record<string, string> = {
  conges: 'Conges',
  maladie: 'Maladie',
};

export interface AbsenceBannerProps {
  weekDates: string[];
  /** Heures d absence par date (calculees via computeAbsenceHoursPerDay) */
  absencesPerDate: Record<string, AbsenceDayInfo>;
  /** Liste brute des absences (pour resoudre id -> AbsencePeriod dans le popover) */
  absences: AbsencePeriod[];
  /** Heures de projet saisies par date (pour distinguer Travaille / Vide) */
  saisiesHoursPerDate: Record<string, number>;
  joursFeries: Record<string, string>;
  onEditAbsence: (absence: AbsencePeriod) => void;
}

export function AbsenceBanner({
  weekDates,
  absencesPerDate,
  absences,
  saisiesHoursPerDate,
  joursFeries,
  onEditAbsence,
}: AbsenceBannerProps) {
  const weekdays = weekDates.filter((d) => !isWeekend(parseISO(d)));

  return (
    <div className="mb-4">
      <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
        Etat de la semaine
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {weekdays.map((date) => {
          const d = parseISO(date);
          const ferie = joursFeries[date];
          const absence = absencesPerDate[date];
          const projectHours = saisiesHoursPerDate[date] ?? 0;

          if (ferie) return <FerieCard key={date} date={d} label={ferie} />;
          if (absence) {
            const period = absences.find((a) => a.id === absence.absence_id);
            return (
              <AbsenceCard
                key={date}
                date={d}
                info={absence}
                period={period}
                onEdit={onEditAbsence}
              />
            );
          }
          if (projectHours > 0) {
            return <TravailCard key={date} date={d} hours={projectHours} />;
          }
          return <EmptyCard key={date} date={d} />;
        })}
      </div>
    </div>
  );
}

function FerieCard({ date, label }: { date: Date; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-orange-200 bg-orange-50 px-2 py-3 dark:border-orange-900/40 dark:bg-orange-950/30">
      <span className="text-muted-foreground text-[11px] font-medium uppercase">
        {format(date, 'EEE', { locale: fr })} {format(date, 'd')}
      </span>
      <span className="mt-1 text-center text-xs font-medium text-orange-600 dark:text-orange-400">
        {label}
      </span>
    </div>
  );
}

function AbsenceCard({
  date,
  info,
  period,
  onEdit,
}: {
  date: Date;
  info: AbsenceDayInfo;
  period?: AbsencePeriod;
  onEdit: (absence: AbsencePeriod) => void;
}) {
  const isConges = info.type === 'conges';
  const isHalf = info.hours < 7;
  const colorBase = isConges
    ? 'border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
    : 'border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-300';

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border px-2 py-3 transition-colors',
          colorBase,
        )}
      >
        <span className="text-muted-foreground text-[11px] font-medium uppercase">
          {format(date, 'EEE', { locale: fr })} {format(date, 'd')}
        </span>
        <span className="mt-1 text-xs font-semibold">
          {ABSENCE_LABEL[info.type]}
          {isHalf ? ' (1/2)' : ''}
        </span>
        <span className="text-[10px] font-medium opacity-75">
          {info.hours}h
        </span>
      </PopoverTrigger>
      {period && (
        <PopoverContent side="bottom" align="center" className="w-72 p-3">
          <p className="text-sm font-medium">
            {ABSENCE_LABEL[period.type]} du{' '}
            {format(parseISO(period.date_debut), 'dd/MM')} au{' '}
            {format(parseISO(period.date_fin), 'dd/MM')}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {period.demi_jour_debut ? 'Commence l apres-midi. ' : ''}
            {period.demi_jour_fin ? 'Finit le matin.' : ''}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={() => onEdit(period)}
          >
            Modifier ou supprimer
          </Button>
        </PopoverContent>
      )}
    </Popover>
  );
}

function TravailCard({ date, hours }: { date: Date; hours: number }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/30">
      <span className="text-muted-foreground text-[11px] font-medium uppercase">
        {format(date, 'EEE', { locale: fr })} {format(date, 'd')}
      </span>
      <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
        <BriefcaseBusiness className="h-3 w-3" />
        Travaille
      </span>
      <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-500">
        {hours}h
      </span>
    </div>
  );
}

function EmptyCard({ date }: { date: Date }) {
  return (
    <div className="border-border text-muted-foreground flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-2 py-3">
      <span className="text-[11px] font-medium uppercase">
        {format(date, 'EEE', { locale: fr })} {format(date, 'd')}
      </span>
      <span className="mt-1 text-[10px]">--</span>
    </div>
  );
}
