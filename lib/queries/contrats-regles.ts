import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';

export interface RegleArchivageRow {
  id: string;
  nom: string;
  etat_source: string;
  delai_jours: number;
  actif: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  /** Contrats sortis de la production par cette regle (archive_regle_id). */
  nbContratsArchives: number;
}

/**
 * Toutes les regles d'archivage, ordonnees par etat source, avec le compteur
 * de contrats deja archives par chacune. Le compteur est ce qui permet a un
 * admin de reperer une regle trop agressive avant qu'elle ne fasse des degats.
 *
 * Pas de GROUP BY cote PostgREST : les deux requetes tournent en parallele et
 * le comptage se fait cote JS, le volume (regles editables a la main, contrats
 * d'un OF) restant modeste.
 */
export async function listReglesArchivage(): Promise<RegleArchivageRow[]> {
  const supabase = await createClient();

  const [reglesRes, contratsRes] = await Promise.all([
    supabase
      .from('contrats_regles_archivage')
      .select('*')
      .order('etat_source', { ascending: true }),
    supabase
      .from('contrats')
      .select('archive_regle_id')
      .not('archive_regle_id', 'is', null),
  ]);

  if (reglesRes.error) {
    logger.error('queries.contrats-regles', 'listReglesArchivage failed', {
      error: reglesRes.error,
    });
    return [];
  }
  if (contratsRes.error) {
    logger.error(
      'queries.contrats-regles',
      'listReglesArchivage: comptage contrats failed',
      { error: contratsRes.error },
    );
  }

  const counts = new Map<string, number>();
  for (const c of contratsRes.data ?? []) {
    const id = c.archive_regle_id;
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return (reglesRes.data ?? []).map((r) => ({
    ...r,
    nbContratsArchives: counts.get(r.id) ?? 0,
  }));
}

/**
 * Nom des regles d'archivage, pour un ensemble d'ids. Utilise le client
 * service-role : `contrats_regles_archivage` est en SELECT admin-only (une
 * regle mal reglee sort du chiffre de la production, cf. migration), mais un
 * CDP doit pouvoir comprendre pourquoi SON contrat a disparu de sa
 * production. On n'expose ici que le strict minimum (id + nom), jamais
 * delai_jours/actif/updated_by qui restent reserves a l'ecran d'admin.
 */
export async function getRegleNomsParIds(
  ids: string[],
): Promise<Map<string, string>> {
  const uniques = Array.from(new Set(ids)).filter(Boolean);
  if (uniques.length === 0) return new Map();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('contrats_regles_archivage')
    .select('id, nom')
    .in('id', uniques);

  if (error) {
    logger.error('queries.contrats-regles', 'getRegleNomsParIds failed', {
      error,
    });
    return new Map();
  }
  return new Map(data.map((r) => [r.id, r.nom]));
}
