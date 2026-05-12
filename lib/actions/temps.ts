'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/guards';
import {
  getWeekDates,
  getSaisiesForWeek,
  getTeamWeekSummary,
} from '@/lib/queries/temps';
import { subtractDaysIso } from '@/lib/utils/dates';

// ---------------------------------------------------------------------------
// Schemas Zod (validation cote serveur, defense en profondeur)
// ---------------------------------------------------------------------------
// Pourquoi : RLS bloque les acces non autorises mais ne contraint pas le
// type. Sans ces guards, un client peut poster heures=NaN ou date=garbage
// et corrompre les donnees ou crasher la query.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = z
  .string()
  .regex(ISO_DATE_RE, 'Date au format YYYY-MM-DD requise');
const projetIdSchema = z.string().uuid('Projet ID doit être un UUID');
const heuresSchema = z
  .number()
  .finite('Heures doit être un nombre fini')
  .min(0, 'Heures negatives interdites')
  .max(24, 'Maximum 24h par jour');

const SaveSaisieTempsSchema = z.object({
  projetId: projetIdSchema,
  date: dateSchema,
  heures: heuresSchema,
});

const SaveSaisieTempsAxesSchema = z.object({
  projetId: projetIdSchema,
  date: dateSchema,
  // Chaque axe : code arbitraire mais bornee (5..30 chars), heures 0..24
  axes: z.record(z.string().min(1).max(64), heuresSchema),
});

const WeekOffsetSchema = z
  .number()
  .int('weekOffset doit etre un entier')
  .gte(-260, 'weekOffset trop loin dans le passe')
  .lte(52, 'weekOffset trop loin dans le futur');

const CurrentWeekDatesSchema = z
  .array(dateSchema)
  .length(7, 'Une semaine doit contenir 7 dates');

// ---------------------------------------------------------------------------
// saveSaisieTemps - upsert a single time entry
// ---------------------------------------------------------------------------

export async function saveSaisieTemps(
  projetId: string,
  date: string,
  heures: number,
): Promise<{ success: boolean; error?: string }> {
  const parsed = SaveSaisieTempsSchema.safeParse({ projetId, date, heures });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // If heures is 0, delete the row
  if (parsed.data.heures === 0) {
    const { error } = await supabase
      .from('saisies_temps')
      .delete()
      .eq('user_id', user.id)
      .eq('projet_id', parsed.data.projetId)
      .eq('date', parsed.data.date);

    if (error) return { success: false, error: error.message };
    revalidatePath('/temps');
    return { success: true };
  }

  // Upsert
  const { error } = await supabase.from('saisies_temps').upsert(
    {
      user_id: user.id,
      projet_id: parsed.data.projetId,
      date: parsed.data.date,
      heures: parsed.data.heures,
    },
    { onConflict: 'user_id,projet_id,date' },
  );

  if (error) return { success: false, error: error.message };
  revalidatePath('/temps');
  return { success: true };
}

// ---------------------------------------------------------------------------
// saveSaisieTempsAxes - replace axes breakdown for a saisie
// ---------------------------------------------------------------------------

export async function saveSaisieTempsAxes(
  projetId: string,
  date: string,
  axes: Record<string, number>,
): Promise<{ success: boolean; error?: string }> {
  const parsed = SaveSaisieTempsAxesSchema.safeParse({ projetId, date, axes });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // Find saisie
  const { data: saisie, error: findError } = await supabase
    .from('saisies_temps')
    .select('id')
    .eq('user_id', user.id)
    .eq('projet_id', parsed.data.projetId)
    .eq('date', parsed.data.date)
    .maybeSingle();

  if (findError) return { success: false, error: findError.message };
  if (!saisie) return { success: false, error: 'Saisie introuvable' };

  // Delete existing axes
  const { error: deleteError } = await supabase
    .from('saisies_temps_axes')
    .delete()
    .eq('saisie_id', saisie.id);

  if (deleteError) return { success: false, error: deleteError.message };

  // Insert new axes (only non-zero)
  const rows = Object.entries(parsed.data.axes)
    .filter(([, h]) => h > 0)
    .map(([axe, heures]) => ({
      saisie_id: saisie.id,
      axe,
      heures,
    }));

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from('saisies_temps_axes')
      .insert(rows);

    if (insertError) return { success: false, error: insertError.message };
  }

  revalidatePath('/temps');
  return { success: true };
}

// ---------------------------------------------------------------------------
// fetchWeekData - server action to get data for a different week (called from client)
// ---------------------------------------------------------------------------

export async function fetchWeekData(weekOffset: number) {
  const parsed = WeekOffsetSchema.safeParse(weekOffset);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'weekOffset invalide');
  }
  const weekDates = getWeekDates(parsed.data);
  const saisies = await getSaisiesForWeek(weekDates);

  return { weekDates, saisies };
}

// ---------------------------------------------------------------------------
// fetchTeamWeekData - server action to get team recap for a different week
// ---------------------------------------------------------------------------

export async function fetchTeamWeekData(weekOffset: number) {
  const parsed = WeekOffsetSchema.safeParse(weekOffset);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'weekOffset invalide');
  }
  const weekDates = getWeekDates(parsed.data);
  const summary = await getTeamWeekSummary(weekDates);

  return { weekDates, summary };
}

// ---------------------------------------------------------------------------
// copyPreviousWeek - copy time entries from the previous week to the current week
// ---------------------------------------------------------------------------

export async function copyPreviousWeek(
  currentWeekDates: string[],
): Promise<{ success: boolean; copied: number; error?: string }> {
  const parsed = CurrentWeekDatesSchema.safeParse(currentWeekDates);
  if (!parsed.success) {
    return {
      success: false,
      copied: 0,
      error: parsed.error.issues[0]?.message ?? 'Dates de semaine invalides',
    };
  }

  const auth = await requireUser();
  if (!auth.ok) return { success: false, copied: 0, error: auth.error };
  const { supabase, user } = auth;
  // Re-bind to the validated array for the rest of the function.
  currentWeekDates = parsed.data;

  // Calculate previous week dates (subtract 7 days from each current date).
  // En UTC strict : new Date('YYYY-MM-DDT00:00:00') est interprete en local,
  // et toISOString() reconvertit en UTC, ce qui decale la date d'un jour en
  // Europe/Paris (UTC+1/+2). Voir lib/utils/dates.ts.
  const previousWeekDates = currentWeekDates.map((dateStr) =>
    subtractDaysIso(dateStr, 7),
  );

  // Fetch saisies for previous week
  const { data: prevSaisies, error: fetchError } = await supabase
    .from('saisies_temps')
    .select('projet_id, date, heures')
    .eq('user_id', user.id)
    .in('date', previousWeekDates);

  if (fetchError)
    return { success: false, copied: 0, error: fetchError.message };
  if (!prevSaisies || prevSaisies.length === 0)
    return { success: true, copied: 0 };

  // Fetch existing saisies for current week to avoid overwriting
  const { data: existingSaisies, error: existingError } = await supabase
    .from('saisies_temps')
    .select('projet_id, date')
    .eq('user_id', user.id)
    .in('date', currentWeekDates);

  if (existingError)
    return { success: false, copied: 0, error: existingError.message };

  const existingKeys = new Set(
    (existingSaisies ?? []).map((s) => `${s.projet_id}|${s.date}`),
  );

  // Map previous week dates to current week dates
  const dateMapping: Record<string, string> = {};
  for (let i = 0; i < previousWeekDates.length; i++) {
    dateMapping[previousWeekDates[i]!] = currentWeekDates[i]!;
  }

  // Build rows to insert (skip entries that already exist)
  const rowsToInsert = prevSaisies
    .filter((s) => {
      const targetDate = dateMapping[s.date]!;
      return !existingKeys.has(`${s.projet_id}|${targetDate}`);
    })
    .map((s) => ({
      user_id: user.id,
      projet_id: s.projet_id,
      date: dateMapping[s.date]!,
      heures: s.heures,
    }));

  if (rowsToInsert.length === 0) return { success: true, copied: 0 };

  const { error: insertError } = await supabase
    .from('saisies_temps')
    .insert(rowsToInsert);

  if (insertError)
    return { success: false, copied: 0, error: insertError.message };

  revalidatePath('/temps');
  return { success: true, copied: rowsToInsert.length };
}
