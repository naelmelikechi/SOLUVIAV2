import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CategorieInterne {
  id: string;
  code: string;
  libelle: string;
  ordre: number;
  actif: boolean;
  archive: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjetInterneEnrichi {
  id: string;
  ref: string;
  statut: string;
  archive: boolean;
  categorie: {
    id: string;
    code: string;
    libelle: string;
    ordre: number;
  } | null;
  heures_12mois: number;
}

export type PeriodeInternes = 'mois' | 'trimestre' | 'annee' | '12mois';
export type ScopeInternes = 'moi' | 'equipe';

export interface CategorieStats {
  categorie_id: string;
  code: string;
  libelle: string;
  heures: number;
  pct: number;
}

export interface CdpStats {
  user_id: string;
  nom: string;
  prenom: string;
  heuresInternes: number;
  heuresClient: number;
  ratio: number | null;
}

export interface TendanceMois {
  mois: string; // 'YYYY-MM'
  parCategorie: Record<string, number>;
}

export interface StatsInternes {
  totalHeures: number;
  parCategorie: CategorieStats[];
  parCdp: CdpStats[] | null;
  tendance12Mois: TendanceMois[];
  ratioBillable: {
    heuresInternes: number;
    heuresClient: number;
    ratio: number | null;
    delta: number | null;
  };
  categorieTop: CategorieStats | null;
}

// ---------------------------------------------------------------------------
// Periode helpers
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

function getPeriodeRange(periode: PeriodeInternes): {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
} {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  let start: Date;
  let end: Date;
  let prevStart: Date;
  let prevEnd: Date;

  switch (periode) {
    case 'mois':
      start = new Date(year, month, 1);
      end = new Date(year, month + 1, 0);
      prevStart = new Date(year, month - 1, 1);
      prevEnd = new Date(year, month, 0);
      break;
    case 'trimestre': {
      const tStart = Math.floor(month / 3) * 3;
      start = new Date(year, tStart, 1);
      end = new Date(year, tStart + 3, 0);
      prevStart = new Date(year, tStart - 3, 1);
      prevEnd = new Date(year, tStart, 0);
      break;
    }
    case 'annee':
      start = new Date(year, 0, 1);
      end = new Date(year, 11, 31);
      prevStart = new Date(year - 1, 0, 1);
      prevEnd = new Date(year - 1, 11, 31);
      break;
    case '12mois':
    default:
      end = new Date(year, month + 1, 0);
      start = new Date(year, month - 11, 1);
      prevEnd = new Date(year, month - 11, 0);
      prevStart = new Date(year, month - 23, 1);
      break;
  }

  return {
    start: isoDate(start),
    end: isoDate(end),
    prevStart: isoDate(prevStart),
    prevEnd: isoDate(prevEnd),
  };
}

// ---------------------------------------------------------------------------
// Categories CRUD
// ---------------------------------------------------------------------------

export async function getCategoriesInternes(
  includeArchived = false,
): Promise<CategorieInterne[]> {
  const supabase = await createClient();

  let query = supabase
    .from('categories_internes')
    .select('*')
    .order('ordre', { ascending: true })
    .order('code', { ascending: true });

  if (!includeArchived) {
    query = query.eq('archive', false);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('queries.projets-internes', 'getCategoriesInternes failed', {
      error,
    });
    throw new AppError(
      'INTERNES_FETCH_FAILED',
      'Impossible de charger les catégories internes',
      { cause: error },
    );
  }

  return (data ?? []) as CategorieInterne[];
}

// ---------------------------------------------------------------------------
// Projets internes list (Configuration tab)
// ---------------------------------------------------------------------------

export async function getProjetsInternesList(): Promise<
  ProjetInterneEnrichi[]
> {
  const supabase = await createClient();

  // Compute 12 months ago for heures count
  const now = new Date();
  const start12m = isoDate(new Date(now.getFullYear(), now.getMonth() - 11, 1));

  const [projetsRes, heuresRes] = await Promise.all([
    supabase
      .from('projets')
      .select(
        `
        id,
        ref,
        statut,
        archive,
        categorie_interne_id,
        categorie:categories_internes!projets_categorie_interne_id_fkey (
          id,
          code,
          libelle,
          ordre
        )
      `,
      )
      .eq('est_interne', true)
      .order('archive', { ascending: true }),
    supabase
      .from('saisies_temps')
      .select(
        `
        heures,
        projet:projets!saisies_temps_projet_id_fkey (
          id,
          est_interne
        )
      `,
      )
      .gte('date', start12m),
  ]);

  if (projetsRes.error) {
    logger.error('queries.projets-internes', 'getProjetsInternesList failed', {
      error: projetsRes.error,
    });
    throw new AppError(
      'INTERNES_FETCH_FAILED',
      'Impossible de charger les projets internes',
      { cause: projetsRes.error },
    );
  }

  const heuresParProjet = new Map<string, number>();
  for (const row of heuresRes.data ?? []) {
    const projet = row.projet as unknown as {
      id: string;
      est_interne: boolean | null;
    } | null;
    if (!projet?.est_interne) continue;
    heuresParProjet.set(
      projet.id,
      (heuresParProjet.get(projet.id) ?? 0) + (row.heures ?? 0),
    );
  }

  return (projetsRes.data ?? []).map((p) => {
    const catRaw = p.categorie as unknown;
    const cat = Array.isArray(catRaw) ? catRaw[0] : catRaw;
    return {
      id: p.id,
      ref: p.ref ?? '',
      statut: p.statut,
      archive: p.archive,
      categorie:
        cat && typeof cat === 'object'
          ? {
              id: (cat as { id: string }).id,
              code: (cat as { code: string }).code,
              libelle: (cat as { libelle: string }).libelle,
              ordre: (cat as { ordre: number }).ordre,
            }
          : null,
      heures_12mois: heuresParProjet.get(p.id) ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Stats principal
// ---------------------------------------------------------------------------

export async function getStatsInternes(params: {
  periode: PeriodeInternes;
  scope: ScopeInternes;
}): Promise<StatsInternes> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return emptyStats();
  }

  const { start, end, prevStart, prevEnd } = getPeriodeRange(params.periode);

  // 12 mois glissants pour la tendance (toujours)
  const now = new Date();
  const start12m = isoDate(new Date(now.getFullYear(), now.getMonth() - 11, 1));
  const end12m = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const selectCols = `
    user_id,
    date,
    heures,
    projet:projets!saisies_temps_projet_id_fkey (
      est_interne,
      categorie_interne_id,
      categorie:categories_internes!projets_categorie_interne_id_fkey (
        id,
        code,
        libelle
      )
    )
  ` as const;

  // Periode courante + precedente + 12 mois en parallele
  const [curRes, prevRes, trendRes, categoriesRes, usersRes] =
    await Promise.all([
      params.scope === 'moi'
        ? supabase
            .from('saisies_temps')
            .select(selectCols)
            .eq('user_id', user.id)
            .gte('date', start)
            .lte('date', end)
        : supabase
            .from('saisies_temps')
            .select(selectCols)
            .gte('date', start)
            .lte('date', end),
      params.scope === 'moi'
        ? supabase
            .from('saisies_temps')
            .select(
              'heures, projet:projets!saisies_temps_projet_id_fkey(est_interne)',
            )
            .eq('user_id', user.id)
            .gte('date', prevStart)
            .lte('date', prevEnd)
        : supabase
            .from('saisies_temps')
            .select(
              'heures, projet:projets!saisies_temps_projet_id_fkey(est_interne)',
            )
            .gte('date', prevStart)
            .lte('date', prevEnd),
      params.scope === 'moi'
        ? supabase
            .from('saisies_temps')
            .select(selectCols)
            .eq('user_id', user.id)
            .gte('date', start12m)
            .lte('date', end12m)
        : supabase
            .from('saisies_temps')
            .select(selectCols)
            .gte('date', start12m)
            .lte('date', end12m),
      supabase
        .from('categories_internes')
        .select('id, code, libelle, ordre')
        .eq('archive', false)
        .order('ordre'),
      params.scope === 'equipe'
        ? supabase.from('users').select('id, nom, prenom').eq('actif', true)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (curRes.error) {
    logger.error('queries.projets-internes', 'getStatsInternes failed', {
      error: curRes.error,
    });
    throw new AppError(
      'INTERNES_FETCH_FAILED',
      'Impossible de charger les statistiques internes',
      { cause: curRes.error },
    );
  }

  type Row = {
    user_id: string;
    date: string;
    heures: number;
    projet: {
      est_interne: boolean | null;
      categorie:
        | { id: string; code: string; libelle: string }
        | { id: string; code: string; libelle: string }[]
        | null;
    } | null;
  };

  const curRows = (curRes.data ?? []) as unknown as Row[];

  // Total + categories sur la periode courante
  let heuresInternes = 0;
  let heuresClient = 0;
  const parCategorieMap = new Map<
    string,
    { code: string; libelle: string; heures: number }
  >();
  const userInternesMap = new Map<
    string,
    { internes: number; client: number }
  >();

  for (const r of curRows) {
    const projet = r.projet;
    const h = r.heures ?? 0;
    if (!projet) continue;
    if (projet.est_interne) {
      heuresInternes += h;
      const catRaw = projet.categorie;
      const cat = Array.isArray(catRaw) ? catRaw[0] : catRaw;
      if (cat) {
        const entry = parCategorieMap.get(cat.id) ?? {
          code: cat.code,
          libelle: cat.libelle,
          heures: 0,
        };
        entry.heures += h;
        parCategorieMap.set(cat.id, entry);
      }
      const u = userInternesMap.get(r.user_id) ?? { internes: 0, client: 0 };
      u.internes += h;
      userInternesMap.set(r.user_id, u);
    } else {
      heuresClient += h;
      const u = userInternesMap.get(r.user_id) ?? { internes: 0, client: 0 };
      u.client += h;
      userInternesMap.set(r.user_id, u);
    }
  }

  const totalHeures = heuresInternes;
  const parCategorie: CategorieStats[] = Array.from(parCategorieMap.entries())
    .map(([id, v]) => ({
      categorie_id: id,
      code: v.code,
      libelle: v.libelle,
      heures: v.heures,
      pct:
        totalHeures > 0 ? Math.round((v.heures / totalHeures) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.heures - a.heures);

  // Delta vs periode precedente
  let prevHeuresInternes = 0;
  let prevHeuresClient = 0;
  type PrevRow = {
    heures: number;
    projet:
      | { est_interne: boolean | null }
      | { est_interne: boolean | null }[]
      | null;
  };
  for (const r of (prevRes.data ?? []) as unknown as PrevRow[]) {
    const projetRaw = r.projet;
    const projet = Array.isArray(projetRaw) ? projetRaw[0] : projetRaw;
    const h = r.heures ?? 0;
    if (!projet) continue;
    if (projet.est_interne) prevHeuresInternes += h;
    else prevHeuresClient += h;
  }
  const prevTotal = prevHeuresInternes + prevHeuresClient;
  const curTotal = heuresInternes + heuresClient;
  const curRatio = curTotal > 0 ? heuresInternes / curTotal : null;
  const prevRatio = prevTotal > 0 ? prevHeuresInternes / prevTotal : null;
  const delta =
    curRatio !== null && prevRatio !== null
      ? Math.round((curRatio - prevRatio) * 1000) / 10
      : null;

  // Tendance 12 mois (toujours, peu importe periode)
  const tendanceMap = new Map<string, Record<string, number>>();
  const mois12: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    mois12.push(key);
    tendanceMap.set(key, {});
  }
  for (const r of (trendRes.data ?? []) as unknown as Row[]) {
    const projet = r.projet;
    if (!projet?.est_interne) continue;
    const catRaw = projet.categorie;
    const cat = Array.isArray(catRaw) ? catRaw[0] : catRaw;
    if (!cat) continue;
    const monthKey = r.date.substring(0, 7);
    const bucket = tendanceMap.get(monthKey);
    if (!bucket) continue;
    bucket[cat.code] = (bucket[cat.code] ?? 0) + (r.heures ?? 0);
  }
  const tendance12Mois: TendanceMois[] = mois12.map((m) => ({
    mois: m,
    parCategorie: tendanceMap.get(m) ?? {},
  }));

  // Stats par CDP (admin / equipe uniquement)
  let parCdp: CdpStats[] | null = null;
  if (params.scope === 'equipe') {
    const users = (usersRes.data ?? []) as Array<{
      id: string;
      nom: string | null;
      prenom: string | null;
    }>;
    parCdp = users
      .flatMap((u) => {
        const stats = userInternesMap.get(u.id) ?? { internes: 0, client: 0 };
        if (stats.internes <= 0 && stats.client <= 0) return [];
        const total = stats.internes + stats.client;
        return [
          {
            user_id: u.id,
            nom: u.nom ?? '',
            prenom: u.prenom ?? '',
            heuresInternes: stats.internes,
            heuresClient: stats.client,
            ratio:
              total > 0
                ? Math.round((stats.internes / total) * 1000) / 10
                : null,
          },
        ];
      })
      .sort((a, b) => b.heuresInternes - a.heuresInternes);
  }

  // Seed parCategorie with all active categories so empty ones still show up
  const allCats = (categoriesRes.data ?? []) as Array<{
    id: string;
    code: string;
    libelle: string;
  }>;
  for (const c of allCats) {
    if (!parCategorieMap.has(c.id)) {
      parCategorie.push({
        categorie_id: c.id,
        code: c.code,
        libelle: c.libelle,
        heures: 0,
        pct: 0,
      });
    }
  }

  return {
    totalHeures,
    parCategorie,
    parCdp,
    tendance12Mois,
    ratioBillable: {
      heuresInternes,
      heuresClient,
      ratio: curRatio !== null ? Math.round(curRatio * 1000) / 10 : null,
      delta,
    },
    categorieTop: parCategorie[0] ?? null,
  };
}

function emptyStats(): StatsInternes {
  return {
    totalHeures: 0,
    parCategorie: [],
    parCdp: null,
    tendance12Mois: [],
    ratioBillable: {
      heuresInternes: 0,
      heuresClient: 0,
      ratio: null,
      delta: null,
    },
    categorieTop: null,
  };
}
