import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';
import { deriveCollabStatus } from '@/lib/utils/collab-status';

export interface IntercontratUser {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  role: string;
  pipeline_access: boolean;
  created_at: string;
  /** Jours sans projet client (depuis created_at) */
  jours_sans_projet: number;
  /** Heures internes saisies sur les 30 derniers jours */
  heures_internes_30j: number;
  /** Heures internes par categorie sur les 30 derniers jours */
  heures_par_categorie: Record<string, number>;
}

export interface TauxBillableEntry {
  user_id: string;
  nom: string;
  prenom: string;
  email: string;
  /** Heures saisies sur projets clients (non internes) - 30 derniers jours */
  heures_billable_30j: number;
  /** Heures saisies sur projets internes - 30 derniers jours */
  heures_internes_30j: number;
  /** Total heures saisies - 30 derniers jours */
  heures_total_30j: number;
  /** Pourcentage 0-100. Null si aucune heure saisie sur la periode. */
  taux_billable: number | null;
}

/**
 * Liste les collaborateurs en intercontrat : actifs, sans projet client
 * affecte, non-admin, non-commercial. Reuse deriveCollabStatus pour la
 * coherence avec /accueil et la sidebar.
 */
export async function getIntercontratUsers(): Promise<IntercontratUser[]> {
  const supabase = await createClient();

  const usersResult = await supabase
    .from('users')
    .select('id, email, nom, prenom, role, pipeline_access, created_at, actif')
    .eq('actif', true);

  if (usersResult.error) {
    logger.error('queries.intercontrat', 'fetch users failed', {
      error: usersResult.error,
    });
    throw new AppError(
      'INTERCONTRAT_FETCH_FAILED',
      'Impossible de charger la liste des collaborateurs',
      { cause: usersResult.error },
    );
  }

  const users = usersResult.data ?? [];
  if (users.length === 0) return [];

  // Compte les projets clients (non internes) par user
  const projetsResult = await supabase
    .from('projets')
    .select('cdp_id, backup_cdp_id')
    .eq('archive', false)
    .eq('est_interne', false);

  const projetsCountMap = new Map<string, number>();
  for (const p of projetsResult.data ?? []) {
    if (p.cdp_id) {
      projetsCountMap.set(p.cdp_id, (projetsCountMap.get(p.cdp_id) ?? 0) + 1);
    }
    if (p.backup_cdp_id) {
      projetsCountMap.set(
        p.backup_cdp_id,
        (projetsCountMap.get(p.backup_cdp_id) ?? 0) + 1,
      );
    }
  }

  const unassigned = users.filter((u) => {
    const status = deriveCollabStatus(
      u.role,
      u.pipeline_access ?? false,
      projetsCountMap.get(u.id) ?? 0,
    );
    return status === 'unassigned_collaborator';
  });

  if (unassigned.length === 0) return [];

  // Heures internes 30j pour ces users
  const days30Ago = new Date();
  days30Ago.setDate(days30Ago.getDate() - 30);
  const days30Iso = days30Ago.toISOString().split('T')[0]!;

  const userIds = unassigned.map((u) => u.id);
  const heuresResult = await supabase
    .from('saisies_temps')
    .select(
      `
      user_id,
      heures,
      projet:projets!saisies_temps_projet_id_fkey (
        est_interne,
        categorie_interne
      )
    `,
    )
    .in('user_id', userIds)
    .gte('date', days30Iso);

  const heuresParUser = new Map<
    string,
    { total: number; byCategorie: Record<string, number> }
  >();
  for (const row of heuresResult.data ?? []) {
    const projet = row.projet as unknown as {
      est_interne: boolean | null;
      categorie_interne: string | null;
    } | null;
    if (!projet?.est_interne || !projet.categorie_interne) continue;

    const userId = row.user_id;
    const heures = row.heures ?? 0;
    let entry = heuresParUser.get(userId);
    if (!entry) {
      entry = { total: 0, byCategorie: {} };
      heuresParUser.set(userId, entry);
    }
    entry.total += heures;
    entry.byCategorie[projet.categorie_interne] =
      (entry.byCategorie[projet.categorie_interne] ?? 0) + heures;
  }

  const now = new Date();
  return unassigned
    .map((u) => {
      const created = new Date(u.created_at);
      const joursSansProjet = Math.max(
        0,
        Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const heures = heuresParUser.get(u.id);
      return {
        id: u.id,
        email: u.email ?? '',
        nom: u.nom ?? '',
        prenom: u.prenom ?? '',
        role: u.role,
        pipeline_access: u.pipeline_access ?? false,
        created_at: u.created_at,
        jours_sans_projet: joursSansProjet,
        heures_internes_30j: heures?.total ?? 0,
        heures_par_categorie: heures?.byCategorie ?? {},
      };
    })
    .sort((a, b) => b.jours_sans_projet - a.jours_sans_projet);
}

/**
 * Taux billable par user actif (non-admin) sur les 30 derniers jours.
 * heures_billable / heures_totales saisies. Trie par taux croissant
 * (les moins billable en premier - signal d alerte).
 */
export async function getTauxBillableTeam30j(): Promise<TauxBillableEntry[]> {
  const supabase = await createClient();

  const usersResult = await supabase
    .from('users')
    .select('id, nom, prenom, email, role')
    .eq('actif', true)
    .neq('role', 'superadmin')
    .neq('role', 'admin');

  if (usersResult.error || !usersResult.data) {
    logger.error('queries.intercontrat', 'taux billable users failed', {
      error: usersResult.error,
    });
    return [];
  }

  const users = usersResult.data;
  if (users.length === 0) return [];

  const days30Ago = new Date();
  days30Ago.setDate(days30Ago.getDate() - 30);
  const days30Iso = days30Ago.toISOString().split('T')[0]!;

  const heuresResult = await supabase
    .from('saisies_temps')
    .select(
      `
      user_id,
      heures,
      projet:projets!saisies_temps_projet_id_fkey (
        est_interne
      )
    `,
    )
    .in(
      'user_id',
      users.map((u) => u.id),
    )
    .gte('date', days30Iso);

  const stats = new Map<string, { billable: number; internes: number }>();
  for (const u of users) {
    stats.set(u.id, { billable: 0, internes: 0 });
  }
  for (const row of heuresResult.data ?? []) {
    const projet = row.projet as unknown as {
      est_interne: boolean | null;
    } | null;
    const entry = stats.get(row.user_id);
    if (!entry) continue;
    const heures = row.heures ?? 0;
    if (projet?.est_interne) {
      entry.internes += heures;
    } else {
      entry.billable += heures;
    }
  }

  return users
    .map((u) => {
      const s = stats.get(u.id) ?? { billable: 0, internes: 0 };
      const total = s.billable + s.internes;
      return {
        user_id: u.id,
        nom: u.nom ?? '',
        prenom: u.prenom ?? '',
        email: u.email ?? '',
        heures_billable_30j: s.billable,
        heures_internes_30j: s.internes,
        heures_total_30j: total,
        taux_billable:
          total > 0 ? Math.round((s.billable / total) * 100) : null,
      };
    })
    .sort((a, b) => {
      // Users with no entries at the bottom; among those with entries,
      // lowest taux billable first (alert signal).
      if (a.taux_billable === null && b.taux_billable === null) return 0;
      if (a.taux_billable === null) return 1;
      if (b.taux_billable === null) return -1;
      return a.taux_billable - b.taux_billable;
    });
}
