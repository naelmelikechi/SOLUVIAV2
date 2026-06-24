import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';
import type { Database } from '@/types/database';

type RdvFormateurRow = Database['public']['Tables']['rdv_formateurs']['Row'];
type RdvCommercialRow = Database['public']['Tables']['rdv_commerciaux']['Row'];

export type RdvFormateurWithRefs = RdvFormateurRow & {
  formateur: { id: string; nom: string; prenom: string } | null;
  cdp: { id: string; nom: string; prenom: string } | null;
};

export type RdvCommercialWithRefs = RdvCommercialRow & {
  commercial: { id: string; nom: string; prenom: string } | null;
};

export async function getRdvFormateursByProjetId(
  projetId: string,
): Promise<RdvFormateurWithRefs[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('rdv_formateurs')
    .select(
      `*,
       formateur:users!rdv_formateurs_formateur_id_fkey(id, nom, prenom),
       cdp:users!rdv_formateurs_cdp_id_fkey(id, nom, prenom)`,
    )
    .eq('projet_id', projetId)
    .order('date_prevue', { ascending: false });

  if (error) {
    logger.error('queries.rdv', 'getRdvFormateursByProjetId failed', {
      projetId,
      error,
    });
    throw new AppError(
      'RDV_FETCH_FAILED',
      'Impossible de charger les RDV formateurs',
      { cause: error },
    );
  }
  return (data ?? []) as RdvFormateurWithRefs[];
}

export async function getRdvCommerciauxByProspectId(
  prospectId: string,
): Promise<RdvCommercialWithRefs[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('rdv_commerciaux')
    .select(
      `*,
       commercial:users!rdv_commerciaux_commercial_id_fkey(id, nom, prenom)`,
    )
    .eq('prospect_id', prospectId)
    .order('date_prevue', { ascending: false });

  if (error) {
    logger.error('queries.rdv', 'getRdvCommerciauxByProspectId failed', {
      prospectId,
      error,
    });
    throw new AppError(
      'RDV_FETCH_FAILED',
      'Impossible de charger les RDV commerciaux',
      { cause: error },
    );
  }
  return (data ?? []) as RdvCommercialWithRefs[];
}

/**
 * Compteur pilotage : RDV formateurs planifiés à venir (statut prévu, date >=
 * aujourd'hui). RLS = CDP (projet.cdp_id), admin = global.
 */
export async function getRdvFormateursAVenirCount(): Promise<number> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { count, error } = await supabase
    .from('rdv_formateurs')
    .select('id', { count: 'exact', head: true })
    .eq('statut', 'prevu')
    .gte('date_prevue', today);
  if (error) {
    logger.error('queries.rdv', 'getRdvFormateursAVenirCount failed', {
      error,
    });
    return 0;
  }
  return count ?? 0;
}
