import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { Database } from '@/types/database';

// ---------------------------------------------------------------------------
// Types nommés (contrats consommés par les pages / composants Feature 9)
// ---------------------------------------------------------------------------

type LinkedinEventRow = Database['public']['Tables']['linkedin_events']['Row'];
type LinkedinMappingRuleRow =
  Database['public']['Tables']['linkedin_mapping_rules']['Row'];
type StatutEvenementLinkedin =
  Database['public']['Enums']['statut_evenement_linkedin'];

/** Évènement LinkedIn brut (encart fiche prospect). */
export type LinkedinEventRecord = LinkedinEventRow;

/** Évènement LinkedIn enrichi du prospect lié (liste admin). */
export type LinkedinEvent = LinkedinEventRow & {
  prospect: { id: string; nom: string } | null;
};

/** Règle de mapping enrichie du développeur affecté (gestion admin). */
export type LinkedinMappingRule = LinkedinMappingRuleRow & {
  developpeur: { id: string; nom: string; prenom: string } | null;
};

export interface LinkedinEventFilters {
  statut?: StatutEvenementLinkedin;
}

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

/**
 * Liste des évènements LinkedIn captés, triés du plus récent au plus ancien.
 * RLS : lecture réservée pipeline + admin.
 */
export async function getLinkedinEvents(
  filters?: LinkedinEventFilters,
): Promise<LinkedinEvent[]> {
  const supabase = await createClient();
  let query = supabase
    .from('linkedin_events')
    .select(
      '*, prospect:prospects!linkedin_events_prospect_cree_id_fkey(id, nom)',
    )
    .order('created_at', { ascending: false })
    .limit(500);

  if (filters?.statut) query = query.eq('statut', filters.statut);

  const { data, error } = await query;
  if (error) {
    logger.error('queries.linkedin', 'getLinkedinEvents failed', { error });
    return [];
  }
  return (data ?? []) as unknown as LinkedinEvent[];
}

/**
 * Règles de mapping (regex société → développeur), triées par priorité
 * croissante (plus la priorité est basse, plus la règle est évaluée tôt).
 * RLS : lecture pipeline + admin (écriture admin seule).
 */
export async function getMappingRules(): Promise<LinkedinMappingRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('linkedin_mapping_rules')
    .select(
      '*, developpeur:users!linkedin_mapping_rules_developpeur_affecte_id_fkey(id, nom, prenom)',
    )
    .order('priorite', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('queries.linkedin', 'getMappingRules failed', { error });
    return [];
  }
  return (data ?? []) as unknown as LinkedinMappingRule[];
}

/**
 * Dernier évènement LinkedIn rattaché à un prospect (encart d'origine sur la
 * fiche). Privilégie la date de l'évènement, puis la date de capture.
 */
export async function getLastLinkedinEventForProspect(
  prospectId: string,
): Promise<LinkedinEventRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('linkedin_events')
    .select('*')
    .eq('prospect_cree_id', prospectId)
    .order('date_evenement', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('queries.linkedin', 'getLastLinkedinEventForProspect failed', {
      prospectId,
      error,
    });
    return null;
  }
  return data ?? null;
}
