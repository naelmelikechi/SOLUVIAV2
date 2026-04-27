// lib/queries/absences.ts
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { AbsencePeriod } from '@/lib/utils/absences';

/**
 * Retourne les absences de l utilisateur courant qui chevauchent la periode
 * [debut, fin] (inclus). RLS filtre automatiquement aux absences du user
 * (ou de tous les users si admin).
 */
export async function getAbsencesForUserAndPeriod(
  debut: string,
  fin: string,
): Promise<AbsencePeriod[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('absences')
    .select('id, type, date_debut, date_fin, demi_jour_debut, demi_jour_fin')
    .lte('date_debut', fin)
    .gte('date_fin', debut)
    .order('date_debut', { ascending: true });

  if (error) {
    logger.error('queries.absences', 'getAbsencesForUserAndPeriod failed', {
      debut,
      fin,
      error,
    });
    return [];
  }

  return data ?? [];
}

/**
 * Retourne toutes les absences d un user (pour vue historique future).
 * Limite a un an pour eviter des dumps massifs.
 */
export async function getAbsencesForCurrentYear(): Promise<AbsencePeriod[]> {
  const year = new Date().getFullYear();
  return getAbsencesForUserAndPeriod(`${year}-01-01`, `${year}-12-31`);
}
