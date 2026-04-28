'use client';

import { useState, useTransition, useCallback, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Plus, X, BriefcaseBusiness, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useCmdEnter } from '@/lib/hooks/use-cmd-enter';
import {
  createAbsenceAction,
  updateAbsenceAction,
  deleteAbsenceAction,
} from '@/lib/actions/absences';
import {
  computeAbsenceTotalHours,
  type AbsenceDayInfo,
  type AbsencePeriod,
  type AbsenceType,
} from '@/lib/utils/absences';
import { cn } from '@/lib/utils';

const ABSENCE_LABEL: Record<string, string> = {
  conges: 'Congés',
  maladie: 'Maladie',
};

interface WeekStatusPanelProps {
  weekDates: string[];
  absencesPerDate: Record<string, AbsenceDayInfo>;
  absences: AbsencePeriod[];
  saisiesHoursPerDate: Record<string, number>;
  joursFeries: Record<string, string>;
  onChanged: () => void;
}

type Mode =
  | { kind: 'list' }
  | { kind: 'form'; absence?: AbsencePeriod; initialDate?: string };

export function WeekStatusPanel({
  weekDates,
  absencesPerDate,
  absences,
  saisiesHoursPerDate,
  joursFeries,
  onChanged,
}: WeekStatusPanelProps) {
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const weekdays = weekDates.slice(0, 5);

  return (
    <div className="border-border w-[340px] shrink-0 self-start rounded-[10px] border bg-white shadow-sm">
      {mode.kind === 'list' ? (
        <ListView
          weekdays={weekdays}
          absencesPerDate={absencesPerDate}
          absences={absences}
          saisiesHoursPerDate={saisiesHoursPerDate}
          joursFeries={joursFeries}
          onNew={(initialDate) => setMode({ kind: 'form', initialDate })}
          onEdit={(absence) => setMode({ kind: 'form', absence })}
        />
      ) : (
        <FormView
          key={mode.absence?.id ?? mode.initialDate ?? 'new'}
          absence={mode.absence}
          initialDate={mode.initialDate}
          onCancel={() => setMode({ kind: 'list' })}
          onSaved={() => {
            setMode({ kind: 'list' });
            onChanged();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

interface ListViewProps {
  weekdays: string[];
  absencesPerDate: Record<string, AbsenceDayInfo>;
  absences: AbsencePeriod[];
  saisiesHoursPerDate: Record<string, number>;
  joursFeries: Record<string, string>;
  onNew: (initialDate?: string) => void;
  onEdit: (absence: AbsencePeriod) => void;
}

function ListView({
  weekdays,
  absencesPerDate,
  absences,
  saisiesHoursPerDate,
  joursFeries,
  onNew,
  onEdit,
}: ListViewProps) {
  return (
    <div>
      <div className="border-border flex items-center justify-between border-b bg-[var(--card-alt)] px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Cette semaine</div>
          <div className="text-muted-foreground text-xs">
            Absences et congés
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 px-3 py-3">
        {weekdays.map((date) => {
          const d = parseISO(date);
          const ferie = joursFeries[date];
          const absenceInfo = absencesPerDate[date];
          const projectHours = saisiesHoursPerDate[date] ?? 0;
          const period = absenceInfo
            ? absences.find((a) => a.id === absenceInfo.absence_id)
            : undefined;

          const dayLabel = `${format(d, 'EEE', { locale: fr })} ${format(d, 'd')}`;

          if (ferie) {
            return (
              <DayRow
                key={date}
                dayLabel={dayLabel}
                state="ferie"
                title={ferie}
                disabled
              />
            );
          }

          if (absenceInfo && period) {
            const isHalf = absenceInfo.hours < 7;
            return (
              <DayRow
                key={date}
                dayLabel={dayLabel}
                state={absenceInfo.type}
                title={`${ABSENCE_LABEL[absenceInfo.type]}${isHalf ? ' (1/2)' : ''}`}
                hours={absenceInfo.hours}
                actionIcon={<Pencil className="h-3.5 w-3.5" />}
                onClick={() => onEdit(period)}
              />
            );
          }

          if (projectHours > 0) {
            return (
              <DayRow
                key={date}
                dayLabel={dayLabel}
                state="travail"
                title="Travaillé"
                hours={projectHours}
                actionIcon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => onNew(date)}
              />
            );
          }

          return (
            <DayRow
              key={date}
              dayLabel={dayLabel}
              state="empty"
              title="Aucune saisie"
              actionIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => onNew(date)}
            />
          );
        })}
      </div>

      <div className="border-border border-t px-3 py-3">
        <Button size="sm" className="w-full" onClick={() => onNew(undefined)}>
          <Plus className="mr-1 h-4 w-4" />
          Ajouter une absence
        </Button>
      </div>
    </div>
  );
}

interface DayRowProps {
  dayLabel: string;
  state: 'conges' | 'maladie' | 'ferie' | 'travail' | 'empty';
  title: string;
  hours?: number;
  actionIcon?: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}

function DayRow({
  dayLabel,
  state,
  title,
  hours,
  actionIcon,
  disabled,
  onClick,
}: DayRowProps) {
  const palette = {
    conges:
      'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
    maladie:
      'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300',
    ferie:
      'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/30 dark:text-orange-400',
    travail:
      'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    empty:
      'border-border border-dashed text-muted-foreground hover:bg-muted/50',
  }[state];

  const Icon = state === 'travail' ? BriefcaseBusiness : null;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'group flex items-center justify-between rounded-md border px-3 py-2 text-left transition-colors',
        palette,
        disabled && 'cursor-default opacity-90',
        !disabled && onClick && 'cursor-pointer',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-muted-foreground w-14 shrink-0 text-[11px] font-medium uppercase">
          {dayLabel}
        </span>
        <div className="flex min-w-0 items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate text-xs font-semibold">{title}</span>
          {typeof hours === 'number' && (
            <span className="text-[11px] font-medium opacity-75">
              · {hours}h
            </span>
          )}
        </div>
      </div>
      {actionIcon && !disabled && (
        <span className="text-muted-foreground/60 group-hover:text-foreground transition-colors">
          {actionIcon}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Form view (inline absence create/edit)
// ---------------------------------------------------------------------------

interface FormViewProps {
  absence?: AbsencePeriod;
  initialDate?: string;
  onCancel: () => void;
  onSaved: () => void;
}

function FormView({ absence, initialDate, onCancel, onSaved }: FormViewProps) {
  const isEdit = !!absence;
  const today = format(new Date(), 'yyyy-MM-dd');
  const [type, setType] = useState<AbsenceType>(absence?.type ?? 'conges');
  const [dateDebut, setDateDebut] = useState(
    absence?.date_debut ?? initialDate ?? today,
  );
  const [dateFin, setDateFin] = useState(
    absence?.date_fin ?? initialDate ?? today,
  );
  const [demiJourDebut, setDemiJourDebut] = useState(
    absence?.demi_jour_debut ?? false,
  );
  const [demiJourFin, setDemiJourFin] = useState(
    absence?.demi_jour_fin ?? false,
  );
  const [isPending, startTransition] = useTransition();

  const total = computeAbsenceTotalHours(
    dateDebut,
    dateFin,
    demiJourDebut,
    demiJourFin,
  );
  const sameDay = dateDebut === dateFin;

  const handleSubmit = useCallback(() => {
    if (sameDay && demiJourDebut && demiJourFin) {
      toast.error('Un seul jour ne peut pas etre demi-journee aux deux bornes');
      return;
    }
    startTransition(async () => {
      const data = {
        type,
        date_debut: dateDebut,
        date_fin: dateFin,
        demi_jour_debut: demiJourDebut,
        demi_jour_fin: demiJourFin,
      };
      const result = isEdit
        ? await updateAbsenceAction(absence!.id, data)
        : await createAbsenceAction(data);
      if (result.success) {
        toast.success(isEdit ? 'Absence mise a jour' : 'Absence enregistree');
        onSaved();
      } else {
        toast.error(result.error ?? 'Erreur lors de l enregistrement');
      }
    });
  }, [
    sameDay,
    demiJourDebut,
    demiJourFin,
    type,
    dateDebut,
    dateFin,
    isEdit,
    absence,
    onSaved,
  ]);

  useCmdEnter(handleSubmit, !isPending);

  // Escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  function handleDelete() {
    if (!absence) return;
    startTransition(async () => {
      const result = await deleteAbsenceAction(absence.id);
      if (result.success) {
        toast.success('Absence supprimee');
        onSaved();
      } else {
        toast.error(result.error ?? 'Erreur lors de la suppression');
      }
    });
  }

  return (
    <div>
      <div className="border-border flex items-center justify-between border-b bg-[var(--card-alt)] px-4 py-3">
        <div className="text-sm font-semibold">
          {isEdit ? "Modifier l'absence" : 'Nouvelle absence'}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          className="h-7 w-7"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4 px-4 py-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={type === 'conges' ? 'default' : 'outline'}
              onClick={() => setType('conges')}
              className="flex-1"
            >
              Congés
            </Button>
            <Button
              type="button"
              size="sm"
              variant={type === 'maladie' ? 'default' : 'outline'}
              onClick={() => setType('maladie')}
              className="flex-1"
            >
              Maladie
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="date_debut" className="text-xs">
              Du
            </Label>
            <Input
              id="date_debut"
              type="date"
              value={dateDebut}
              onChange={(e) => {
                setDateDebut(e.target.value);
                if (e.target.value > dateFin) setDateFin(e.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date_fin" className="text-xs">
              Au
            </Label>
            <Input
              id="date_fin"
              type="date"
              value={dateFin}
              min={dateDebut}
              onChange={(e) => setDateFin(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Checkbox
              id="demi_debut"
              checked={demiJourDebut}
              onCheckedChange={(v) => setDemiJourDebut(v === true)}
            />
            <Label
              htmlFor="demi_debut"
              className="cursor-pointer text-xs leading-tight font-normal"
            >
              Commence l après-midi (3.5h le{' '}
              {format(new Date(dateDebut), 'dd/MM')})
            </Label>
          </div>
          {!sameDay && (
            <div className="flex items-start gap-2">
              <Checkbox
                id="demi_fin"
                checked={demiJourFin}
                onCheckedChange={(v) => setDemiJourFin(v === true)}
              />
              <Label
                htmlFor="demi_fin"
                className="cursor-pointer text-xs leading-tight font-normal"
              >
                Finit le matin (3.5h le {format(new Date(dateFin), 'dd/MM')})
              </Label>
            </div>
          )}
        </div>

        <div className="bg-muted/30 rounded-md border px-3 py-2 text-xs">
          <span className="text-muted-foreground">Total : </span>
          <span className="font-medium">
            {total.jours} jour{total.jours > 1 ? 's' : ''} ouvré
            {total.jours > 1 ? 's' : ''} / {total.heures}h
          </span>
        </div>
      </div>

      <div className="border-border flex flex-col gap-2 border-t px-4 py-3">
        <Button
          size="sm"
          className="w-full"
          onClick={handleSubmit}
          disabled={isPending}
        >
          {isPending
            ? isEdit
              ? 'Mise à jour...'
              : 'Enregistrement...'
            : isEdit
              ? 'Enregistrer'
              : 'Créer'}
          {!isPending && <span className="ml-2 text-xs opacity-50">⌘↵</span>}
        </Button>
        {isEdit && (
          <Button
            size="sm"
            variant="outline"
            className="w-full text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={handleDelete}
            disabled={isPending}
          >
            Supprimer
          </Button>
        )}
      </div>
    </div>
  );
}
