import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { Database } from '@/types/database';

export type PassationSynthese =
  Database['public']['Tables']['document_synthese']['Row'];

type ProspectRow = Database['public']['Tables']['prospects']['Row'];
type ContactRow = Database['public']['Tables']['prospect_contacts']['Row'];
type RdvRow = Database['public']['Tables']['rdv_commerciaux']['Row'];
type SignatureRow = Database['public']['Tables']['signature_requests']['Row'];

/**
 * Données agrégées nécessaires au rendu du PDF de synthèse de passation.
 * Sérialisable en JSON : ce type est aussi le snapshot stocké dans
 * `document_synthese.contenu` à la génération (document figé, cf. trame).
 */
export interface SyntheseData {
  prospect: ProspectRow;
  commercial: { nom: string; prenom: string } | null;
  client: {
    id: string;
    raison_sociale: string;
    cdp_referent_id: string | null;
  } | null;
  contacts: ContactRow[];
  rdvs: RdvRow[];
  signature: SignatureRow | null;
  referenceDossier: string;
  dateProduction: string;
}

/** Dernière synthèse de passation produite pour un prospect (ou null). */
export async function getSyntheseByProspect(
  prospectId: string,
): Promise<PassationSynthese | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('document_synthese')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('queries.passation', 'getSyntheseByProspect failed', {
      prospectId,
      error,
    });
    return null;
  }
  return data;
}

/**
 * Charge tout le contexte prospect (identité, interlocuteurs, RDV, négociation,
 * signature) pour nourrir le document de synthèse. Renvoie null si le prospect
 * est introuvable.
 */
export async function getSyntheseData(
  prospectId: string,
): Promise<SyntheseData | null> {
  const supabase = await createClient();

  const { data: prospect, error } = await supabase
    .from('prospects')
    .select('*')
    .eq('id', prospectId)
    .single();

  if (error || !prospect) {
    logger.error('queries.passation', 'getSyntheseData prospect failed', {
      prospectId,
      error,
    });
    return null;
  }

  const [contactsRes, rdvsRes, signatureRes] = await Promise.all([
    supabase
      .from('prospect_contacts')
      .select('*')
      .eq('prospect_id', prospectId)
      .order('created_at', { ascending: true }),
    supabase
      .from('rdv_commerciaux')
      .select('*')
      .eq('prospect_id', prospectId)
      .order('date_prevue', { ascending: true }),
    supabase
      .from('signature_requests')
      .select('*')
      .eq('prospect_id', prospectId)
      .eq('statut', 'signee')
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let commercial: { nom: string; prenom: string } | null = null;
  if (prospect.commercial_id) {
    const { data } = await supabase
      .from('users')
      .select('nom, prenom')
      .eq('id', prospect.commercial_id)
      .maybeSingle();
    commercial = data;
  }

  let client: {
    id: string;
    raison_sociale: string;
    cdp_referent_id: string | null;
  } | null = null;
  if (prospect.client_id) {
    const { data } = await supabase
      .from('clients')
      .select('id, raison_sociale, cdp_referent_id')
      .eq('id', prospect.client_id)
      .maybeSingle();
    client = data;
  }

  const signature = signatureRes.data;
  const referenceYear = new Date(
    signature?.signed_at ?? prospect.created_at,
  ).getFullYear();

  return {
    prospect,
    commercial,
    client,
    contacts: contactsRes.data ?? [],
    rdvs: rdvsRes.data ?? [],
    signature,
    referenceDossier: `SLV-${referenceYear}-${prospect.id.slice(0, 8).toUpperCase()}`,
    dateProduction: new Date().toISOString(),
  };
}
