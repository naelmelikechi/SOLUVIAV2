import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';
import type { StatutIdee, CibleIdee } from '@/lib/utils/constants';
import type { Database } from '@/types/database';

type IdeeRow = Database['public']['Tables']['idees']['Row'];
type UserRef = { id: string; nom: string; prenom: string; role: string };

export type IdeeWithRefs = IdeeRow & {
  auteur: UserRef | null;
  validee_par_user: UserRef | null;
  implementee_par_user: UserRef | null;
};

export interface IdeeFilters {
  auteurId?: string;
  cible?: CibleIdee;
  search?: string;
  showArchived?: boolean;
}

export async function getIdeesGroupedByStatut(
  filters?: IdeeFilters,
): Promise<Record<StatutIdee, IdeeWithRefs[]>> {
  const supabase = await createClient();
  let query = supabase
    .from('idees')
    .select(
      `*,
       auteur:users!idees_auteur_id_fkey(id, nom, prenom, role),
       validee_par_user:users!idees_validee_par_fkey(id, nom, prenom, role),
       implementee_par_user:users!idees_implementee_par_fkey(id, nom, prenom, role)`,
    )
    .order('created_at', { ascending: false });

  if (!filters?.showArchived) {
    query = query.eq('archive', false);
  }
  if (filters?.auteurId) query = query.eq('auteur_id', filters.auteurId);
  if (filters?.cible) query = query.eq('cible', filters.cible);
  if (filters?.search?.trim()) {
    query = query.ilike('titre', `%${filters.search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('queries.idees', 'getIdeesGroupedByStatut failed', { error });
    throw new AppError(
      'IDEES_FETCH_FAILED',
      'Impossible de charger les idées',
      { cause: error },
    );
  }

  const grouped: Record<StatutIdee, IdeeWithRefs[]> = {
    proposee: [],
    validee: [],
    implementee: [],
    rejetee: [],
  };

  for (const idee of data ?? []) {
    grouped[idee.statut].push(idee as IdeeWithRefs);
  }
  return grouped;
}

export async function getIdeeById(id: string): Promise<IdeeWithRefs | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('idees')
    .select(
      `*,
       auteur:users!idees_auteur_id_fkey(id, nom, prenom, role),
       validee_par_user:users!idees_validee_par_fkey(id, nom, prenom, role),
       implementee_par_user:users!idees_implementee_par_fkey(id, nom, prenom, role)`,
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    logger.error('queries.idees', 'getIdeeById failed', { id, error });
    throw new AppError('IDEES_FETCH_FAILED', 'Impossible de charger l’idée', {
      cause: error,
    });
  }
  return data as IdeeWithRefs | null;
}

export interface IdeesStats {
  proposees: number;
  validees: number;
  implementees: number;
  rejetees: number;
}

export async function getIdeesStats(
  from?: Date,
  to?: Date,
): Promise<IdeesStats> {
  const supabase = await createClient();
  let query = supabase.from('idees').select('statut', { count: 'exact' });

  if (from) query = query.gte('created_at', from.toISOString());
  if (to) query = query.lt('created_at', to.toISOString());

  const { data, error } = await query;
  if (error) {
    return { proposees: 0, validees: 0, implementees: 0, rejetees: 0 };
  }
  const stats: IdeesStats = {
    proposees: 0,
    validees: 0,
    implementees: 0,
    rejetees: 0,
  };
  for (const row of data ?? []) {
    if (row.statut === 'proposee') stats.proposees++;
    else if (row.statut === 'validee') stats.validees++;
    else if (row.statut === 'implementee') stats.implementees++;
    else if (row.statut === 'rejetee') stats.rejetees++;
  }
  return stats;
}
