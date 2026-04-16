import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';
import type { AvatarMode } from '@/lib/utils/avatar';

export interface EquipeProjet {
  id: string;
  ref: string | null;
  client: string | null;
  role: 'principal' | 'backup';
}

export interface EquipeMember {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  telephone: string | null;
  avatar_mode: AvatarMode | null;
  avatar_seed: string | null;
  avatar_regen_date: string | null;
  projets: EquipeProjet[];
}

/**
 * List all active users with the active non-absence projets they are assigned
 * to (as principal CDP or backup CDP). Results are sorted by prenom nom.
 * No role info is exposed — this feed powers the flat Équipe page.
 */
export async function getEquipeWithProjets(): Promise<EquipeMember[]> {
  const supabase = await createClient();

  const [usersResult, projetsResult] = await Promise.all([
    supabase
      .from('users')
      .select(
        'id, email, nom, prenom, telephone, avatar_mode, avatar_seed, avatar_regen_date',
      )
      .eq('actif', true)
      .order('prenom', { ascending: true })
      .order('nom', { ascending: true }),
    supabase
      .from('projets')
      .select(
        `
        id, ref, cdp_id, backup_cdp_id,
        client:clients!projets_client_id_fkey(raison_sociale)
      `,
      )
      .eq('archive', false)
      .eq('est_absence', false)
      .in('statut', ['actif', 'en_pause']),
  ]);

  if (usersResult.error) {
    logger.error('queries.equipe', 'getEquipeWithProjets users failed', {
      error: usersResult.error,
    });
    throw new AppError(
      'EQUIPE_FETCH_FAILED',
      "Impossible de charger l'équipe",
      { cause: usersResult.error },
    );
  }
  if (projetsResult.error) {
    logger.error('queries.equipe', 'getEquipeWithProjets projets failed', {
      error: projetsResult.error,
    });
    throw new AppError(
      'EQUIPE_FETCH_FAILED',
      "Impossible de charger l'équipe",
      { cause: projetsResult.error },
    );
  }

  const byUser = new Map<string, EquipeProjet[]>();
  for (const projet of projetsResult.data ?? []) {
    const clientName = Array.isArray(projet.client)
      ? (projet.client[0]?.raison_sociale ?? null)
      : ((projet.client as { raison_sociale?: string } | null)
          ?.raison_sociale ?? null);
    if (projet.cdp_id) {
      const list = byUser.get(projet.cdp_id) ?? [];
      list.push({
        id: projet.id,
        ref: projet.ref,
        client: clientName,
        role: 'principal',
      });
      byUser.set(projet.cdp_id, list);
    }
    if (projet.backup_cdp_id) {
      const list = byUser.get(projet.backup_cdp_id) ?? [];
      list.push({
        id: projet.id,
        ref: projet.ref,
        client: clientName,
        role: 'backup',
      });
      byUser.set(projet.backup_cdp_id, list);
    }
  }

  return (usersResult.data ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    nom: u.nom,
    prenom: u.prenom,
    telephone: u.telephone,
    avatar_mode: u.avatar_mode as AvatarMode | null,
    avatar_seed: u.avatar_seed,
    avatar_regen_date: u.avatar_regen_date,
    projets: byUser.get(u.id) ?? [],
  }));
}
