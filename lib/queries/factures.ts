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
      client:clients!factures_client_id_fkey!inner(id, trigramme, raison_sociale, is_demo, archive)
    `,
    )
    // Les clients de demo (is_demo=true) restent visibles : utilises pour
    // les smoke-tests reels et vu que leurs factures sont pushees en
    // brouillon Odoo (is_draft=true), pas de risque comptable. Pour les
    // masquer, l UI peut filtrer via le badge is_demo dans la liste.
    .eq('client.archive', false)
    .neq('statut', 'a_emettre') // exclut les brouillons (vus dans onglet dedie)
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

// ---------------------------------------------------------------------------
// Brouillons : factures en statut 'a_emettre' (creees mais pas encore
// envoyees). Affiches dans l'onglet Brouillons de /facturation pour
// verification + envoi. Inclut clients demo (pour le smoke-test).
// ---------------------------------------------------------------------------
export async function getBrouillons() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('factures')
    .select(
      `
      id, date_emission, date_echeance, mois_concerne,
      montant_ht, taux_tva, montant_tva, montant_ttc,
      est_avoir, avoir_motif, facture_origine_id, created_at,
      projet:projets!factures_projet_id_fkey(id, ref),
      client:clients!factures_client_id_fkey(id, trigramme, raison_sociale, is_demo),
      lignes:facture_lignes(id, description, montant_ht, event_type, event_source_id,
        contrat:contrats!facture_lignes_contrat_id_fkey(ref, contract_number, apprenant_nom, apprenant_prenom))
    `,
    )
    .eq('statut', 'a_emettre')
    .order('created_at', { ascending: true });
  if (error) {
    logger.error('queries.factures', 'getBrouillons failed', { error });
    return [];
  }
  return data ?? [];
}

export type BrouillonItem = Awaited<ReturnType<typeof getBrouillons>>[number];

// ---------------------------------------------------------------------------
// checkDuplicateBilling : verifie si un contrat est deja sur une autre
// facture (live, pas avoir) pour le meme mois_relatif. Retourne un warning
// non-bloquant pour l'UI (l'utilisateur peut quand meme facturer s'il sait
// ce qu'il fait). Sert a alerter sur la double-facturation accidentelle.
// ---------------------------------------------------------------------------
export async function checkDuplicateBilling(params: {
  contratId: string;
  moisRelatif: number;
  excludeFactureId?: string;
}): Promise<
  | { duplicate: false }
  | {
      duplicate: true;
      onFactureRef: string | null;
      onFactureStatut: string;
      moisRelatif: number;
    }
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('facture_lignes')
    .select(
      'id, mois_relatif, facture:factures!facture_lignes_facture_id_fkey(id, ref, statut, est_avoir)',
    )
    .eq('contrat_id', params.contratId)
    .eq('mois_relatif', params.moisRelatif)
    .eq('est_avoir', false);
  if (error || !data) return { duplicate: false };

  const hit = data.find(
    (l) =>
      l.facture &&
      !l.facture.est_avoir &&
      l.facture.id !== params.excludeFactureId &&
      // On ne previent que sur des factures actives (pas brouillon : un
      // brouillon non envoye ne consomme pas encore de facturation legale)
      ['emise', 'en_retard', 'payee'].includes(l.facture.statut),
  );

  if (!hit) return { duplicate: false };

  return {
    duplicate: true,
    onFactureRef: hit.facture?.ref ?? null,
    onFactureStatut: hit.facture?.statut ?? 'emise',
    moisRelatif: hit.mois_relatif ?? params.moisRelatif,
  };
}

// ---------------------------------------------------------------------------
// getProjetActiveContratsForFacturation : liste les contrats actifs d'un
// projet, avec snapshot npec + commission projet pour suggestion automatique
// dans les modales d'edition de ligne / nouvelle facture.
// ---------------------------------------------------------------------------
export async function getProjetActiveContratsForFacturation(projetId: string) {
  const supabase = await createClient();
  // Les 2 queries dependent juste de projetId (deja resolu en argument),
  // donc parallelisables. Si projet n existe pas, on a paye un fetch
  // contrats pour rien : marginal vs le gain dans le cas nominal.
  const [{ data: projet }, { data: contrats }] = await Promise.all([
    supabase
      .from('projets')
      .select(
        'id, ref, taux_commission, client_id, client:clients!projets_client_id_fkey(id, raison_sociale)',
      )
      .eq('id', projetId)
      .maybeSingle(),
    supabase
      .from('contrats')
      .select(
        `id, ref, contract_number, internal_number,
       apprenant_nom, apprenant_prenom, formation_titre,
       contract_state, npec_amount, date_debut, duree_mois`,
      )
      .eq('projet_id', projetId)
      .eq('archive', false)
      .order('apprenant_nom'),
  ]);
  if (!projet) return null;

  return {
    projetId: projet.id,
    projetRef: projet.ref ?? '',
    clientId: projet.client_id,
    clientRaisonSociale: projet.client?.raison_sociale ?? '',
    tauxCommission: Number(projet.taux_commission ?? 10),
    contrats: contrats ?? [],
  };
}

export type ProjetForFacturation = NonNullable<
  Awaited<ReturnType<typeof getProjetActiveContratsForFacturation>>
>;

// ---------------------------------------------------------------------------
// listProjetsForFacturation : liste tous les projets actifs pour le
// selecteur de la modale "Nouvelle facture" from-scratch.
// ---------------------------------------------------------------------------
export async function listProjetsForFacturation() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projets')
    .select(
      `id, ref, taux_commission,
       client:clients!projets_client_id_fkey!inner(id, raison_sociale, is_demo, archive)`,
    )
    .eq('client.archive', false)
    .eq('archive', false)
    .order('ref');
  if (error) {
    logger.error('queries.factures', 'listProjetsForFacturation failed', {
      error,
    });
    return [];
  }
  return (data ?? []).map((p) => ({
    id: p.id,
    ref: p.ref ?? '',
    taux_commission: Number(p.taux_commission ?? 10),
    client_id: p.client?.id ?? '',
    client_raison_sociale: p.client?.raison_sociale ?? '',
    is_demo: p.client?.is_demo ?? false,
  }));
}

export async function getFactureByRef(ref: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('factures')
    .select(
      `
      id, ref, numero_seq, date_emission, date_echeance, mois_concerne,
      montant_ht, taux_tva, montant_tva, montant_ttc,
      statut, est_avoir, avoir_motif, facture_origine_id, email_envoye, created_by, objet, conditions_reglement,
      projet:projets!factures_projet_id_fkey(id, ref),
      client:clients!factures_client_id_fkey(id, trigramme, raison_sociale, siret, adresse, localisation, tva_intracommunautaire),
      lignes:facture_lignes(id, contrat_id, description, montant_ht, contrat:contrats!facture_lignes_contrat_id_fkey(ref, contract_number, apprenant_nom, apprenant_prenom))
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

// ---------------------------------------------------------------------------
// getFactureById : meme structure que getFactureByRef mais filtre par id UUID.
// Necessaire pour les brouillons (statut 'a_emettre') qui n'ont pas encore
// de ref/numero_seq attribues (gapless legal -> attribue seulement a l'envoi).
// ---------------------------------------------------------------------------
export async function getFactureById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('factures')
    .select(
      `
      id, ref, numero_seq, date_emission, date_echeance, mois_concerne,
      montant_ht, taux_tva, montant_tva, montant_ttc,
      statut, est_avoir, avoir_motif, facture_origine_id, email_envoye, created_by, objet, conditions_reglement,
      projet:projets!factures_projet_id_fkey(id, ref),
      client:clients!factures_client_id_fkey(id, trigramme, raison_sociale, siret, adresse, localisation, tva_intracommunautaire),
      lignes:facture_lignes(id, contrat_id, description, montant_ht, contrat:contrats!facture_lignes_contrat_id_fkey(ref, contract_number, apprenant_nom, apprenant_prenom))
    `,
    )
    .eq('id', id)
    .single();
  if (error) {
    logger.error('queries.factures', 'getFactureById failed', { id, error });
    return null;
  }
  return data;
}

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
