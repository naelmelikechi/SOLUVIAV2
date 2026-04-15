import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';
import { ABSENCE_PROJECTS } from '@/lib/utils/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SaisieTemps {
  projet_id: string;
  projet_ref: string;
  projet_label: string;
  est_absence: boolean;
  absence_type?: 'conges' | 'maladie' | 'ferie';
  /** date (ISO) -> heures */
  heures: Record<string, number>;
  /** date -> { axe_code -> heures } */
  axes: Record<string, Record<string, number>>;
}

// ---------------------------------------------------------------------------
// getWeekDates - pure utility, no DB
// ---------------------------------------------------------------------------

export function getWeekDates(weekOffset: number = 0): string[] {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sun
  const monday = new Date(today);
  monday.setDate(
    today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + weekOffset * 7,
  );

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().split('T')[0]!);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// getSaisiesForWeek
// ---------------------------------------------------------------------------

const ABSENCE_TYPE_MAP: Record<string, 'conges' | 'maladie' | 'ferie'> = {
  [ABSENCE_PROJECTS.CONGES]: 'conges',
  [ABSENCE_PROJECTS.MALADIE]: 'maladie',
  [ABSENCE_PROJECTS.FERIES]: 'ferie',
};

export async function getSaisiesForWeek(
  weekDates: string[],
): Promise<SaisieTemps[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // 1. Fetch saisies for the week
  const { data: saisies, error: saisiesError } = await supabase
    .from('saisies_temps')
    .select(
      `
      id,
      projet_id,
      date,
      heures,
      projet:projets!saisies_temps_projet_id_fkey (
        ref,
        est_absence,
        client:clients!projets_client_id_fkey (
          raison_sociale
        )
      )
    `,
    )
    .eq('user_id', user.id)
    .in('date', weekDates);

  if (saisiesError) {
    logger.error('queries.temps', 'getSaisiesForWeek failed (saisies)', {
      error: saisiesError,
    });
    throw new AppError(
      'TEMPS_FETCH_FAILED',
      'Impossible de charger les saisies temps',
      { cause: saisiesError },
    );
  }
  if (!saisies || saisies.length === 0) return [];

  // 2. Fetch axes for those saisies
  const saisieIds = saisies.map((s) => s.id);
  const { data: axesRows, error: axesError } = await supabase
    .from('saisies_temps_axes')
    .select('saisie_id, axe, heures')
    .in('saisie_id', saisieIds);

  if (axesError) {
    logger.error('queries.temps', 'getSaisiesForWeek failed (axes)', {
      error: axesError,
    });
    throw new AppError(
      'TEMPS_FETCH_FAILED',
      'Impossible de charger les axes temps',
      { cause: axesError },
    );
  }

  // Build a lookup: saisie_id -> { axe -> heures }
  const axesBySaisie: Record<string, Record<string, number>> = {};
  for (const row of axesRows ?? []) {
    if (!axesBySaisie[row.saisie_id]) {
      axesBySaisie[row.saisie_id] = {};
    }
    axesBySaisie[row.saisie_id]![row.axe] = row.heures;
  }

  // 3. Group by projet_id
  const grouped: Record<string, SaisieTemps> = {};

  for (const s of saisies) {
    const projet = s.projet as unknown as {
      ref: string | null;
      est_absence: boolean;
      client: { raison_sociale: string } | null;
    };

    if (!grouped[s.projet_id]) {
      const ref = projet.ref ?? '';
      const clientName = projet.client?.raison_sociale ?? '';
      const label = projet.est_absence ? ref : `${ref} - ${clientName}`;

      grouped[s.projet_id] = {
        projet_id: s.projet_id,
        projet_ref: ref,
        projet_label: label,
        est_absence: projet.est_absence,
        absence_type: ABSENCE_TYPE_MAP[ref],
        heures: {},
        axes: {},
      };
    }

    grouped[s.projet_id]!.heures[s.date] = s.heures;
    grouped[s.projet_id]!.axes[s.date] = axesBySaisie[s.id] ?? {};
  }

  return Object.values(grouped);
}

// ---------------------------------------------------------------------------
// Team week summary (admin only - RLS ensures admin sees all)
// ---------------------------------------------------------------------------

export interface TeamMemberSummary {
  userId: string;
  nom: string;
  prenom: string;
  /** date (ISO) -> total heures for the day */
  dailyTotals: Record<string, number>;
  weekTotal: number;
}

export async function getTeamWeekSummary(
  weekDates: string[],
): Promise<TeamMemberSummary[]> {
  const supabase = await createClient();

  // Fetch all saisies_temps for the given dates (admin sees all via RLS)
  const { data: saisies, error: saisiesError } = await supabase
    .from('saisies_temps')
    .select('user_id, date, heures')
    .in('date', weekDates);

  if (saisiesError) {
    logger.error('queries.temps', 'getTeamWeekSummary failed (saisies)', {
      error: saisiesError,
    });
    throw new AppError(
      'TEMPS_FETCH_FAILED',
      'Impossible de charger le récapitulatif équipe',
      { cause: saisiesError },
    );
  }

  // Fetch all active users
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, nom, prenom')
    .eq('actif', true)
    .order('nom');

  if (usersError) {
    logger.error('queries.temps', 'getTeamWeekSummary failed (users)', {
      error: usersError,
    });
    throw new AppError(
      'TEMPS_FETCH_FAILED',
      'Impossible de charger les utilisateurs',
      { cause: usersError },
    );
  }

  // Group saisies by user_id -> date -> total heures
  const userTotals: Record<string, Record<string, number>> = {};
  for (const s of saisies ?? []) {
    if (!userTotals[s.user_id]) {
      userTotals[s.user_id] = {};
    }
    userTotals[s.user_id]![s.date] =
      (userTotals[s.user_id]![s.date] ?? 0) + s.heures;
  }

  // Only weekdays for the week total (Mon-Fri = first 5 dates)
  const weekdayDates = weekDates.slice(0, 5);

  return (users ?? []).map((u) => {
    const dailyTotals: Record<string, number> = {};
    let weekTotal = 0;

    for (const date of weekDates) {
      const total = userTotals[u.id]?.[date] ?? 0;
      dailyTotals[date] = total;
    }
    for (const date of weekdayDates) {
      weekTotal += dailyTotals[date] ?? 0;
    }

    return {
      userId: u.id,
      nom: u.nom ?? '',
      prenom: u.prenom ?? '',
      dailyTotals,
      weekTotal,
    };
  });
}

// ---------------------------------------------------------------------------
// getUserProjets - projects the user is assigned to (non-absence, active)
// ---------------------------------------------------------------------------

export async function getUserProjets(): Promise<
  { id: string; ref: string; label: string }[]
> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('projets')
    .select(
      `
      id,
      ref,
      est_absence,
      client:clients!projets_client_id_fkey (
        raison_sociale
      )
    `,
    )
    .eq('archive', false)
    .eq('est_absence', false)
    .eq('statut', 'actif')
    .or(`cdp_id.eq.${user.id},backup_cdp_id.eq.${user.id}`)
    .order('ref', { ascending: true });

  if (error) {
    logger.error('queries.temps', 'getUserProjets failed', { error });
    throw new AppError(
      'TEMPS_FETCH_FAILED',
      'Impossible de charger les projets utilisateur',
      { cause: error },
    );
  }

  return (data ?? []).map((p) => {
    const client = p.client as unknown as { raison_sociale: string } | null;
    return {
      id: p.id,
      ref: p.ref ?? '',
      label: `${p.ref ?? ''} - ${client?.raison_sociale ?? ''}`,
    };
  });
}

// ---------------------------------------------------------------------------
// getAbsenceProjets - absence projects (congés, maladie, fériés)
// ---------------------------------------------------------------------------

export async function getAbsenceProjets(): Promise<
  {
    id: string;
    ref: string;
    label: string;
    absence_type: 'conges' | 'maladie' | 'ferie';
  }[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('projets')
    .select('id, ref')
    .eq('est_absence', true)
    .eq('archive', false);

  if (error) {
    logger.error('queries.temps', 'getAbsenceProjets failed', { error });
    throw new AppError(
      'TEMPS_FETCH_FAILED',
      'Impossible de charger les projets absence',
      { cause: error },
    );
  }

  return (data ?? []).map((p) => ({
    id: p.id,
    ref: p.ref ?? '',
    label: p.ref ?? '',
    absence_type: ABSENCE_TYPE_MAP[p.ref ?? ''] ?? 'conges',
  }));
}
