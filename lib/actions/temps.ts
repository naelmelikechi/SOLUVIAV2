'use server';

import { createClient } from '@/lib/supabase/server';
import { getWeekDates, getSaisiesForWeek } from '@/lib/queries/temps';

// ---------------------------------------------------------------------------
// saveSaisieTemps — upsert a single time entry
// ---------------------------------------------------------------------------

export async function saveSaisieTemps(
  projetId: string,
  date: string,
  heures: number,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifié' };

  // If heures is 0, delete the row
  if (heures === 0) {
    const { error } = await supabase
      .from('saisies_temps')
      .delete()
      .eq('user_id', user.id)
      .eq('projet_id', projetId)
      .eq('date', date);

    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  // Upsert
  const { error } = await supabase.from('saisies_temps').upsert(
    {
      user_id: user.id,
      projet_id: projetId,
      date,
      heures,
    },
    { onConflict: 'user_id,projet_id,date' },
  );

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ---------------------------------------------------------------------------
// saveSaisieTempsAxes — replace axes breakdown for a saisie
// ---------------------------------------------------------------------------

export async function saveSaisieTempsAxes(
  projetId: string,
  date: string,
  axes: Record<string, number>,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifié' };

  // Find saisie
  const { data: saisie, error: findError } = await supabase
    .from('saisies_temps')
    .select('id')
    .eq('user_id', user.id)
    .eq('projet_id', projetId)
    .eq('date', date)
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
  const rows = Object.entries(axes)
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

  return { success: true };
}

// ---------------------------------------------------------------------------
// fetchWeekData — server action to get data for a different week (called from client)
// ---------------------------------------------------------------------------

export async function fetchWeekData(weekOffset: number) {
  const weekDates = getWeekDates(weekOffset);
  const saisies = await getSaisiesForWeek(weekDates);

  return { weekDates, saisies };
}

// ---------------------------------------------------------------------------
// copyPreviousWeek — copy time entries from the previous week to the current week
// ---------------------------------------------------------------------------

export async function copyPreviousWeek(
  currentWeekDates: string[],
): Promise<{ success: boolean; copied: number; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, copied: 0, error: 'Non authentifié' };

  // Calculate previous week dates (subtract 7 days from each current date)
  const previousWeekDates = currentWeekDates.map((dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0]!;
  });

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

  return { success: true, copied: rowsToInsert.length };
}
