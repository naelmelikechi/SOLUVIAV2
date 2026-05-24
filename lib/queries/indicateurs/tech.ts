// lib/queries/indicateurs/tech.ts
// Indicateurs tech : idees proposees / implementees.
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import {
  type TechPeriod,
  type TechCounters,
  isoTimestamp,
  getTechRange,
} from './shared';

export async function getTechCounters(
  period: TechPeriod,
  reference: Date = new Date(),
): Promise<TechCounters> {
  try {
    const supabase = await createClient();
    const range = getTechRange(period, reference);

    const [proposeesRes, implementeesRes] = await Promise.all([
      supabase
        .from('idees')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', isoTimestamp(range.start))
        .lte('created_at', isoTimestamp(range.end)),
      supabase
        .from('idees')
        .select('id', { count: 'exact', head: true })
        .eq('statut', 'implementee')
        .gte('implementee_at', isoTimestamp(range.start))
        .lte('implementee_at', isoTimestamp(range.end)),
    ]);

    if (proposeesRes.error)
      logger.error('queries.indicateurs', 'tech proposees failed', {
        error: proposeesRes.error,
      });
    if (implementeesRes.error)
      logger.error('queries.indicateurs', 'tech implementees failed', {
        error: implementeesRes.error,
      });

    return {
      ideesProposees: proposeesRes.count ?? 0,
      ideesImplementees: implementeesRes.count ?? 0,
    };
  } catch (error) {
    logger.error('queries.indicateurs', 'getTechCounters failed', { error });
    return { ideesProposees: 0, ideesImplementees: 0 };
  }
}
