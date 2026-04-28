import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';
import { getCategorieInterneLabel } from '@/lib/utils/projets-internes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SaisieTemps {
  projet_id: string;
  projet_ref: string;
  projet_label: string;
  est_interne: boolean;
  categorie_interne: string | null;
  /** date (ISO) -> heures */
  heures: Record<string, number>;
  /** date -> { axe_code -> heures } */
  axes: Record<string, Record<string, number>>;
}

function buildProjetLabel(
  ref: string,
  clientName: string,
  estInterne: boolean,
  categorieInterne: string | null,
): string {
  if (estInterne) {
    return getCategorieInterneLabel(categorieInterne);
  }
  return clientName ? `${ref} - ${clientName}` : ref;
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

export async function getSaisiesForWeek(
  weekDates: string[],
): Promise<SaisieTemps[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // 1. Fetch all active projets the user is assigned to (cdp or backup).
  //    These are always rendered in the grid, even with no saisies yet (lazy render:
  //    a DB row is only created when the user actually enters hours > 0).
  const { data: userProjets, error: projetsError } = await supabase
    .from('projets')
    .select(
      `
      id,
      ref,
      est_interne,
      categorie_interne,
      client:clients!projets_client_id_fkey (
        raison_sociale
      )
    `,
    )
    .eq('archive', false)
    .eq('statut', 'actif')
    .or(`cdp_id.eq.${user.id},backup_cdp_id.eq.${user.id},est_interne.eq.true`)
    .order('est_interne', { ascending: true })
    .order('ref', { ascending: true });

  if (projetsError) {
    logger.error('queries.temps', 'getSaisiesForWeek failed (user projets)', {
      error: projetsError,
    });
    throw new AppError(
      'TEMPS_FETCH_FAILED',
      'Impossible de charger les projets',
      { cause: projetsError },
    );
  }

  // 2. Fetch saisies for the week
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
        est_interne,
        categorie_interne,
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

  // 3. Fetch axes for those saisies
  const saisieIds = (saisies ?? []).map((s) => s.id);
  const { data: axesRows, error: axesError } =
    saisieIds.length > 0
      ? await supabase
          .from('saisies_temps_axes')
          .select('saisie_id, axe, heures')
          .in('saisie_id', saisieIds)
      : { data: [], error: null };

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

  // 4. Seed grouped map with ALL user projets (empty heures/axes by default).
  const grouped: Record<string, SaisieTemps> = {};
  for (const p of userProjets ?? []) {
    const client = p.client as unknown as { raison_sociale: string } | null;
    const ref = p.ref ?? '';
    const clientName = client?.raison_sociale ?? '';
    const estInterne = p.est_interne ?? false;
    const categorieInterne = p.categorie_interne ?? null;
    grouped[p.id] = {
      projet_id: p.id,
      projet_ref: ref,
      projet_label: buildProjetLabel(
        ref,
        clientName,
        estInterne,
        categorieInterne,
      ),
      est_interne: estInterne,
      categorie_interne: categorieInterne,
      heures: {},
      axes: {},
    };
  }

  // 5. Merge in existing saisies (adds any projet rows not already in userProjets).
  for (const s of saisies ?? []) {
    const projet = s.projet as unknown as {
      ref: string | null;
      est_interne: boolean | null;
      categorie_interne: string | null;
      client: { raison_sociale: string } | null;
    };

    if (!grouped[s.projet_id]) {
      const ref = projet.ref ?? '';
      const clientName = projet.client?.raison_sociale ?? '';
      const estInterne = projet.est_interne ?? false;
      const categorieInterne = projet.categorie_interne ?? null;

      grouped[s.projet_id] = {
        projet_id: s.projet_id,
        projet_ref: ref,
        projet_label: buildProjetLabel(
          ref,
          clientName,
          estInterne,
          categorieInterne,
        ),
        est_interne: estInterne,
        categorie_interne: categorieInterne,
        heures: {},
        axes: {},
      };
    }

    grouped[s.projet_id]!.heures[s.date] = s.heures;
    grouped[s.projet_id]!.axes[s.date] = axesBySaisie[s.id] ?? {};
  }

  // Sort: client projects first (by ref), then internal projects (by ref).
  return Object.values(grouped).sort((a, b) => {
    if (a.est_interne !== b.est_interne) return a.est_interne ? 1 : -1;
    return a.projet_ref.localeCompare(b.projet_ref);
  });
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
  {
    id: string;
    ref: string;
    label: string;
    est_interne: boolean;
    categorie_interne: string | null;
  }[]
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
      est_interne,
      categorie_interne,
      client:clients!projets_client_id_fkey (
        raison_sociale
      )
    `,
    )
    .eq('archive', false)
    .eq('statut', 'actif')
    .or(`cdp_id.eq.${user.id},backup_cdp_id.eq.${user.id},est_interne.eq.true`)
    .order('est_interne', { ascending: true })
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
    const ref = p.ref ?? '';
    const estInterne = p.est_interne ?? false;
    const categorieInterne = p.categorie_interne ?? null;
    return {
      id: p.id,
      ref,
      label: buildProjetLabel(
        ref,
        client?.raison_sociale ?? '',
        estInterne,
        categorieInterne,
      ),
      est_interne: estInterne,
      categorie_interne: categorieInterne,
    };
  });
}
