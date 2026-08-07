import { createClient } from '@/lib/supabase/server';
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
