'use client';

import { useState } from 'react';
import { format, parseISO, isWeekend } from 'date-fns';
import { fr } from 'date-fns/locale';
import { X, Palmtree, ThermometerSun } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AbsenceInfo {
  type: 'conges' | 'maladie';
  hours: number;
}

export interface AbsenceBannerProps {
  weekDates: string[];
  absences: Record<string, AbsenceInfo>;
  joursFeries: Record<string, string>;
  onSetAbsence: (
    date: string,
    type: 'conges' | 'maladie',
    hours: number,
  ) => void;
  onRemoveAbsence: (date: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ABSENCE_LABEL: Record<string, string> = {
  conges: 'Congés',
  maladie: 'Maladie',
};

function durationLabel(hours: number): string {
  if (hours >= 7) return '';
  return hours <= 3.5 ? '(matin)' : '';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AbsenceBanner({
  weekDates,
  absences,
  joursFeries,
  onSetAbsence,
  onRemoveAbsence,
}: AbsenceBannerProps) {
  // Only Mon-Fri
  const weekdays = weekDates.filter((d) => !isWeekend(parseISO(d)));

  return (
    <div className="mb-4">
      <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
        Absences
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {weekdays.map((date) => {
          const d = parseISO(date);
          const ferie = joursFeries[date];
          const absence = absences[date];

          if (ferie) {
            return <FerieCard key={date} date={d} label={ferie} />;
          }

          if (absence) {
            return (
              <AbsenceCardFilled
                key={date}
                date={d}
                absence={absence}
                onSetAbsence={(type, hours) => onSetAbsence(date, type, hours)}
                onRemove={() => onRemoveAbsence(date)}
              />
            );
          }

          return (
            <AbsenceCardEmpty
              key={date}
              date={d}
              onSelect={(type, hours) => onSetAbsence(date, type, hours)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FerieCard({ date, label }: { date: Date; label: string }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border px-2 py-3',
        'border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800/60',
      )}
    >
      <span className="text-muted-foreground text-[11px] font-medium uppercase">
        {format(date, 'EEE', { locale: fr })} {format(date, 'd')}
      </span>
      <span className="mt-1 text-center text-xs font-medium text-orange-500">
        {label}
      </span>
    </div>
  );
}

function AbsenceCardFilled({
  date,
  absence,
  onSetAbsence,
  onRemove,
}: {
  date: Date;
  absence: AbsenceInfo;
  onSetAbsence: (type: 'conges' | 'maladie', hours: number) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isConges = absence.type === 'conges';
  const isHalf = absence.hours < 7;
  const halfLabel = durationLabel(absence.hours);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border px-2 py-3 transition-colors',
          isConges
            ? isHalf
              ? 'border-sky-200 bg-sky-50/70 dark:border-sky-800 dark:bg-sky-950/30'
              : 'border-sky-300 bg-sky-100 dark:border-sky-700 dark:bg-sky-950/50'
            : isHalf
              ? 'border-violet-200 bg-violet-50/70 dark:border-violet-800 dark:bg-violet-950/30'
              : 'border-violet-300 bg-violet-100 dark:border-violet-700 dark:bg-violet-950/50',
        )}
      >
        <span className="text-muted-foreground text-[11px] font-medium uppercase">
          {format(date, 'EEE', { locale: fr })} {format(date, 'd')}
        </span>
        <span
          className={cn(
            'mt-1 text-xs font-semibold',
            isConges
              ? 'text-sky-700 dark:text-sky-300'
              : 'text-violet-700 dark:text-violet-300',
          )}
        >
          {ABSENCE_LABEL[absence.type]}
          {halfLabel ? ` ${halfLabel}` : ''}
        </span>
        <span
          className={cn(
            'text-[10px] font-medium',
            isConges
              ? 'text-sky-500 dark:text-sky-400'
              : 'text-violet-500 dark:text-violet-400',
          )}
        >
          {absence.hours}h
        </span>
      </PopoverTrigger>
      <AbsencePopoverContent
        hasExisting
        onSelect={(type, hours) => {
          onSetAbsence(type, hours);
          setOpen(false);
        }}
        onRemove={() => {
          onRemove();
          setOpen(false);
        }}
      />
    </Popover>
  );
}

function AbsenceCardEmpty({
  date,
  onSelect,
}: {
  date: Date;
  onSelect: (type: 'conges' | 'maladie', hours: number) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-2 py-3 transition-colors',
          'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground',
        )}
      >
        <span className="text-[11px] font-medium uppercase">
          {format(date, 'EEE', { locale: fr })} {format(date, 'd')}
        </span>
        <span className="mt-1 text-[10px]">--</span>
      </PopoverTrigger>
      <AbsencePopoverContent
        hasExisting={false}
        onSelect={(type, hours) => {
          onSelect(type, hours);
          setOpen(false);
        }}
      />
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Shared popover content
// ---------------------------------------------------------------------------

function AbsencePopoverContent({
  hasExisting,
  onSelect,
  onRemove,
}: {
  hasExisting: boolean;
  onSelect: (type: 'conges' | 'maladie', hours: number) => void;
  onRemove?: () => void;
}) {
  const options: {
    type: 'conges' | 'maladie';
    label: string;
    icon: typeof Palmtree;
    color: string;
    choices: { label: string; hours: number }[];
  }[] = [
    {
      type: 'conges',
      label: 'Congés',
      icon: Palmtree,
      color: 'text-sky-600 dark:text-sky-400',
      choices: [
        { label: 'Journée (7h)', hours: 7 },
        { label: 'Matin (3.5h)', hours: 3.5 },
        { label: 'Après-midi (3.5h)', hours: 3.5 },
      ],
    },
    {
      type: 'maladie',
      label: 'Maladie',
      icon: ThermometerSun,
      color: 'text-violet-600 dark:text-violet-400',
      choices: [
        { label: 'Journée (7h)', hours: 7 },
        { label: 'Matin (3.5h)', hours: 3.5 },
        { label: 'Après-midi (3.5h)', hours: 3.5 },
      ],
    },
  ];

  return (
    <PopoverContent side="bottom" align="center" className="w-56 p-0">
      <div className="space-y-0.5 p-1.5">
        {options.map((group) => {
          const Icon = group.icon;
          return (
            <div key={group.type}>
              <div
                className={cn(
                  'flex items-center gap-1.5 px-2 pt-2 pb-1 text-xs font-semibold',
                  group.color,
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {group.label}
              </div>
              {group.choices.map((choice, idx) => (
                <button
                  key={`${group.type}-${idx}`}
                  onClick={() => onSelect(group.type, choice.hours)}
                  className="hover:bg-muted flex w-full items-center rounded-md px-3 py-1.5 text-left text-sm transition-colors"
                >
                  {choice.label}
                </button>
              ))}
            </div>
          );
        })}

        {hasExisting && onRemove && (
          <>
            <div className="border-border mx-1.5 border-t" />
            <button
              onClick={onRemove}
              className="flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <X className="h-3.5 w-3.5" />
              Retirer
            </button>
          </>
        )}
      </div>
    </PopoverContent>
  );
}
