import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';

export async function getFacturesList() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('factures')
    .select(
      `
      id, ref, numero_seq, date_emission, date_echeance, mois_concerne,
      montant_ht, taux_tva, montant_tva, montant_ttc,
      statut, est_avoir, avoir_motif, facture_origine_id,
      projet:projets!factures_projet_id_fkey(id, ref),
      client:clients!factures_client_id_fkey(id, trigramme, raison_sociale)
    `,
    )
    .order('numero_seq', { ascending: false });
  if (error) {
    logger.error('queries.factures', 'getFacturesList failed', { error });
    throw new AppError(
      'FACTURES_FETCH_FAILED',
      'Impossible de charger les factures',
      { cause: error },
    );
  }
  return data;
}

export type FactureListItem = Awaited<
  ReturnType<typeof getFacturesList>
>[number];

export async function getFactureByRef(ref: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('factures')
    .select(
      `
      id, ref, numero_seq, date_emission, date_echeance, mois_concerne,
      montant_ht, taux_tva, montant_tva, montant_ttc,
      statut, est_avoir, avoir_motif, facture_origine_id, email_envoye, created_by,
      projet:projets!factures_projet_id_fkey(id, ref),
      client:clients!factures_client_id_fkey(id, trigramme, raison_sociale, siret, adresse),
      lignes:facture_lignes(id, contrat_id, description, montant_ht, contrat:contrats!facture_lignes_contrat_id_fkey(ref, apprenant_nom, apprenant_prenom))
    `,
    )
    .eq('ref', ref)
    .single();
  if (error) {
    logger.error('queries.factures', 'getFactureByRef failed', { ref, error });
    return null;
  }
  return data;
}

export type FactureDetail = NonNullable<
  Awaited<ReturnType<typeof getFactureByRef>>
>;

export async function getPaiementsByFactureId(factureId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('paiements')
    .select('id, montant, date_reception, saisie_manuelle')
    .eq('facture_id', factureId)
    .order('date_reception');
  if (error) {
    logger.error('queries.factures', 'getPaiementsByFactureId failed', {
      factureId,
      error,
    });
    throw new AppError(
      'FACTURES_PAIEMENTS_FETCH_FAILED',
      'Impossible de charger les paiements',
      { cause: error },
    );
  }
  return data;
}

export async function getEcheancesPending() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('echeances')
    .select(
      `
      id, mois_concerne, date_emission_prevue, montant_prevu_ht, validee,
      projet:projets!echeances_projet_id_fkey(id, ref, client:clients!projets_client_id_fkey(trigramme, raison_sociale))
    `,
    )
    .is('facture_id', null)
    .eq('validee', false)
    .order('date_emission_prevue');
  if (error) {
    logger.error('queries.factures', 'getEcheancesPending failed', { error });
    throw new AppError(
      'FACTURES_ECHEANCES_FETCH_FAILED',
      'Impossible de charger les échéances',
      { cause: error },
    );
  }
  return data;
}

export type EcheancePending = Awaited<
  ReturnType<typeof getEcheancesPending>
>[number];

// Check if an avoir exists for a given facture
export async function getAvoirForFacture(factureOrigineId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('factures')
    .select('id, ref')
    .eq('est_avoir', true)
    .eq('facture_origine_id', factureOrigineId)
    .maybeSingle();
  if (error) {
    logger.error('queries.factures', 'getAvoirForFacture failed', {
      factureOrigineId,
      error,
    });
    return null;
  }
  return data;
}

// Get a facture ref by its UUID (for resolving origin facture on avoirs)
export async function getFactureRefById(factureId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('factures')
    .select('ref')
    .eq('id', factureId)
    .single();
  if (error) {
    logger.error('queries.factures', 'getFactureRefById failed', {
      factureId,
      error,
    });
    return null;
  }
  return data?.ref ?? null;
}
