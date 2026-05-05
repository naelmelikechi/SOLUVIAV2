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
    nom: string | null;
  } | null;
}

export async function listAjustementsPending(): Promise<AjustementPending[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('facturation_ajustements_pending')
    .select(
      `id, type, delta_ht, motif, detail, created_at,
       contrat:contrats(id, apprenant_nom, apprenant_prenom, contract_number, npec_amount),
       projet:projets(id, ref, nom)`,
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
