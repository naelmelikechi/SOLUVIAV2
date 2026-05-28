import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

export interface AjustementPending {
  id: string;
  type: 'npec_change' | 'rupture';
  delta_ht: number;
  motif: string | null;
  detail: unknown;
  created_at: string;
  contrat: {
    id: string;
    apprenant_nom: string | null;
    apprenant_prenom: string | null;
    contract_number: string | null;
    npec_amount: number | null;
  } | null;
  projet: {
    id: string;
    ref: string | null;
  } | null;
}

export async function listAjustementsPending(): Promise<AjustementPending[]> {
  const supabase = await createClient();
  // Note: projets n a pas de colonne 'nom' (que 'ref'). Le code demandait
  // historiquement (id, ref, nom) -> erreur 42703 a chaque load /facturation
  // (440+ events Sentry).
  const { data, error } = await supabase
    .from('facturation_ajustements_pending')
    .select(
      `id, type, delta_ht, motif, detail, created_at,
       contrat:contrats(id, apprenant_nom, apprenant_prenom, contract_number, npec_amount),
       projet:projets(id, ref)`,
    )
    .is('resolved_at', null)
    .order('created_at', { ascending: false });
  if (error) {
    logger.error('queries.ajustements', 'list pending failed', { error });
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.type as 'npec_change' | 'rupture',
    delta_ht: Number(row.delta_ht),
    motif: row.motif,
    detail: row.detail,
    created_at: row.created_at,
    contrat: row.contrat as AjustementPending['contrat'],
    projet: row.projet as AjustementPending['projet'],
  }));
}

export interface CandidateFacture {
  id: string;
  ref: string | null;
  date_emission: string | null;
  montant_ht: number;
  est_avoir: boolean;
  statut: string;
}

/**
 * Factures candidates pour resoudre un ajustement (action='emitted').
 * Filtre :
 *  - meme contrat (au moins une ligne sur le contrat)
 *  - signe coherent : delta > 0 -> facture standard, delta < 0 -> avoir
 *  - emise apres la creation de l'ajustement
 *  - pas deja liee a un autre ajustement resolved
 */
export async function listCandidateFacturesForAjustement(
  ajustementId: string,
): Promise<CandidateFacture[]> {
  const supabase = await createClient();
  const { data: aj, error: ajErr } = await supabase
    .from('facturation_ajustements_pending')
    .select('contrat_id, delta_ht, created_at')
    .eq('id', ajustementId)
    .maybeSingle();
  if (ajErr || !aj || !aj.contrat_id) return [];

  const wantsAvoir = Number(aj.delta_ht) < 0;
  const sinceDate = (aj.created_at ?? new Date().toISOString()).slice(0, 10);
  // Recupere les factures qui ont au moins une ligne sur le contrat cible.
  // On filtre cote application le statut + signe car la jointure ligne ->
  // facture rend complexe le filtrage en pure SQL via Supabase REST.
  const { data, error } = await supabase
    .from('factures')
    .select(
      'id, ref, date_emission, montant_ht, est_avoir, statut, facture_lignes!inner(contrat_id)',
    )
    .eq('facture_lignes.contrat_id', aj.contrat_id)
    .eq('est_avoir', wantsAvoir)
    .gte('date_emission', sinceDate)
    .order('date_emission', { ascending: false });
  if (error) {
    logger.error('queries.ajustements', 'list candidate factures failed', {
      error,
    });
    return [];
  }

  // Exclut les factures deja liees a un autre ajustement resolved
  const factureIds = (data ?? []).map((f) => f.id);
  let alreadyLinked = new Set<string>();
  if (factureIds.length > 0) {
    const { data: linked } = await supabase
      .from('facturation_ajustements_pending')
      .select('resolved_facture_id')
      .in('resolved_facture_id', factureIds)
      .not('resolved_facture_id', 'is', null);
    alreadyLinked = new Set(
      (linked ?? [])
        .map((l) => l.resolved_facture_id)
        .filter((v): v is string => v != null),
    );
  }

  return (data ?? []).flatMap((f) =>
    alreadyLinked.has(f.id)
      ? []
      : [
          {
            id: f.id,
            ref: f.ref,
            date_emission: f.date_emission,
            montant_ht: Number(f.montant_ht),
            est_avoir: f.est_avoir,
            statut: f.statut,
          },
        ],
  );
}
