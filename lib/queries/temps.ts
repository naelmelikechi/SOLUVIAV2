import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CategorieInterneRef {
  id: string;
  code: string;
  libelle: string;
}

export interface SaisieTemps {
  projet_id: string;
  projet_ref: string;
  projet_label: string;
  est_interne: boolean;
  categorie_interne: CategorieInterneRef | null;
  /** date (ISO) -> heures */
  heures: Record<string, number>;
  /** date -> { axe_code -> heures } */
  axes: Record<string, Record<string, number>>;
}

function buildProjetLabel(
  ref: string,
  clientName: string,
  estInterne: boolean,
  categorieInterne: CategorieInterneRef | null,
): string {
  if (estInterne) {
    return categorieInterne?.libelle ?? 'Interne';
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

const PROJET_INTERNE_SELECT = `
  id,
  ref,
  est_interne,
  categorie_interne:categories_internes!projets_categorie_interne_id_fkey (
    id,
    code,
    libelle
  ),
  client:clients!projets_client_id_fkey (
    raison_sociale
  )
` as const;

type ProjetJoinShape = {
  id: string;
  ref: string | null;
  est_interne: boolean | null;
  categorie_interne: CategorieInterneRef | null;
  client: { raison_sociale: string } | null;
};

function normalizeCategorie(
  raw: unknown,
): CategorieInterneRef | null {
  if (!raw) return null;
  // Supabase peut renvoyer un objet ou un tableau selon la cardinalite detectee
  const obj = Array.isArray(raw) ? raw[0] : raw;
  if (!obj || typeof obj !== 'object') return null;
  const r = obj as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.code !== 'string' || typeof r.libelle !== 'string') {
    return null;
  }
  return { id: r.id, code: r.code, libelle: r.libelle };
}

export async function getSaisiesForWeek(
  weekDates: string[],
): Promise<SaisieTemps[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [
    { data: userProjets, error: projetsError },
    { data: saisies, error: saisiesError },
  ] = await Promise.all([
    supabase
      .from('projets')
      .select(PROJET_INTERNE_SELECT)
      .eq('archive', false)
      .eq('statut', 'actif')
      .or(
        `cdp_id.eq.${user.id},backup_cdp_id.eq.${user.id},est_interne.eq.true`,
      )
      .order('est_interne', { ascending: true })
      .order('ref', { ascending: true }),
    supabase
      .from('saisies_temps')
      .select(
        `
        id,
        projet_id,
        date,
        heures,
        projet:projets!saisies_temps_projet_id_fkey (
          ${PROJET_INTERNE_SELECT}
        )
      `,
      )
      .eq('user_id', user.id)
      .in('date', weekDates),
  ]);

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

  const axesBySaisie: Record<string, Record<string, number>> = {};
  for (const row of axesRows ?? []) {
    if (!axesBySaisie[row.saisie_id]) {
      axesBySaisie[row.saisie_id] = {};
    }
    axesBySaisie[row.saisie_id]![row.axe] = row.heures;
  }

  const grouped: Record<string, SaisieTemps> = {};
  for (const p of (userProjets ?? []) as unknown as ProjetJoinShape[]) {
    const client = p.client;
    const ref = p.ref ?? '';
    const clientName = client?.raison_sociale ?? '';
    const estInterne = p.est_interne ?? false;
    const categorieInterne = normalizeCategorie(p.categorie_interne);
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

  for (const s of saisies ?? []) {
    const projet = s.projet as unknown as ProjetJoinShape;

    if (!grouped[s.projet_id]) {
      const ref = projet.ref ?? '';
      const clientName = projet.client?.raison_sociale ?? '';
      const estInterne = projet.est_interne ?? false;
      const categorieInterne = normalizeCategorie(projet.categorie_interne);

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

export async function getCurrentUserTempsTotals(): Promise<{
  weekTotal: number;
  monthTotal: number;
  yearTotal: number;
  annee: number;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return {
      weekTotal: 0,
      monthTotal: 0,
      yearTotal: 0,
      annee: new Date().getFullYear(),
    };

  const now = new Date();
  const annee = now.getFullYear();
  const startOfYear = new Date(annee, 0, 1).toISOString().split('T')[0]!;
  const endOfYear = new Date(annee, 11, 31).toISOString().split('T')[0]!;

  const { data: saisies } = await supabase
    .from('saisies_temps')
    .select('date, heures')
    .eq('user_id', user.id)
    .gte('date', startOfYear)
    .lte('date', endOfYear);

  const all = saisies ?? [];
  const yearTotal = all.reduce((s, r) => s + (r.heures ?? 0), 0);

  const monthStart = new Date(annee, now.getMonth(), 1)
    .toISOString()
    .split('T')[0]!;
  const monthEnd = new Date(annee, now.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0]!;
  const monthTotal = all
    .filter((r) => r.date >= monthStart && r.date <= monthEnd)
    .reduce((s, r) => s + (r.heures ?? 0), 0);

  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekStart = monday.toISOString().split('T')[0]!;
  const weekEnd = sunday.toISOString().split('T')[0]!;
  const weekTotal = all
    .filter((r) => r.date >= weekStart && r.date <= weekEnd)
    .reduce((s, r) => s + (r.heures ?? 0), 0);

  return { weekTotal, monthTotal, yearTotal, annee };
}

export async function getTeamWeekSummary(
  weekDates: string[],
): Promise<TeamMemberSummary[]> {
  const supabase = await createClient();

  const [saisiesRes, usersRes] = await Promise.all([
    supabase
      .from('saisies_temps')
      .select('user_id, date, heures')
      .in('date', weekDates),
    supabase
      .from('users')
      .select('id, nom, prenom')
      .eq('actif', true)
      .order('nom'),
  ]);

  const { data: saisies, error: saisiesError } = saisiesRes;
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

  const { data: users, error: usersError } = usersRes;

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

  const userTotals: Record<string, Record<string, number>> = {};
  for (const s of saisies ?? []) {
    if (!userTotals[s.user_id]) {
      userTotals[s.user_id] = {};
    }
    userTotals[s.user_id]![s.date] =
      (userTotals[s.user_id]![s.date] ?? 0) + s.heures;
  }

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
    categorie_interne: CategorieInterneRef | null;
  }[]
> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('projets')
    .select(PROJET_INTERNE_SELECT)
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

  return ((data ?? []) as unknown as ProjetJoinShape[]).map((p) => {
    const client = p.client;
    const ref = p.ref ?? '';
    const estInterne = p.est_interne ?? false;
    const categorieInterne = normalizeCategorie(p.categorie_interne);
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
