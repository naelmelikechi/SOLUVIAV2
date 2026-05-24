import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';
import type { Database } from '@/types/database';

export type DevisRow = Database['public']['Tables']['devis']['Row'];
export type DevisLigneRow = Database['public']['Tables']['devis_lignes']['Row'];

export interface DevisListItem extends DevisRow {
  client: { trigramme: string; raison_sociale: string } | null;
  societe_emettrice: { code: string; raison_sociale: string } | null;
}

export interface FactureLieeRow {
  id: string;
  ref: string | null;
  statut: string;
  montant_ht: number;
  montant_ttc: number;
  est_acompte: boolean;
  date_emission: string | null;
}

export interface DevisDetail extends DevisRow {
  client: {
    id: string;
    trigramme: string;
    raison_sociale: string;
    adresse: string | null;
  } | null;
  societe_emettrice: {
    id: string;
    code: string;
    raison_sociale: string;
    siret: string;
    tva_intracom: string;
    adresse: string;
    code_postal: string;
    ville: string;
    pays: string;
    email_contact: string;
    banque_nom: string | null;
    banque_iban: string | null;
    banque_bic: string | null;
    mentions_legales: string | null;
    conditions_reglement_default: string | null;
    logo_url: string | null;
    validite_devis_jours: number;
  } | null;
  lignes: DevisLigneRow[];
  factures_liees: FactureLieeRow[];
}

export async function listDevis(): Promise<DevisListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('devis')
    .select(
      `*, client:clients(trigramme, raison_sociale), societe_emettrice:societes_emettrices(code, raison_sociale)`,
    )
    .order('created_at', { ascending: false });
  if (error) {
    logger.error('queries.devis', 'list failed', { error });
    throw new AppError(
      'DEVIS_FETCH_FAILED',
      'Impossible de charger les devis',
      { cause: error },
    );
  }
  return data as DevisListItem[];
}

const DEVIS_DETAIL_SELECT = `
  *,
  client:clients(id, trigramme, raison_sociale, adresse),
  societe_emettrice:societes_emettrices(*),
  lignes:devis_lignes(*),
  factures_liees:factures!factures_devis_id_fkey(id, ref, statut, montant_ht, montant_ttc, est_acompte, date_emission)
`;

export async function getDevisByRef(ref: string): Promise<DevisDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('devis')
    .select(DEVIS_DETAIL_SELECT)
    .eq('ref', ref)
    .maybeSingle();
  if (error) {
    logger.error('queries.devis', 'getByRef failed', { ref, error });
    throw new AppError('DEVIS_FETCH_FAILED', `Devis ${ref} introuvable`, {
      cause: error,
    });
  }
  if (!data) return null;
  // Tri ascendant des lignes par ordre
  const detail = data as unknown as DevisDetail;
  detail.lignes = [...detail.lignes].sort((a, b) => a.ordre - b.ordre);
  return detail;
}

export async function getDevisById(id: string): Promise<DevisDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('devis')
    .select(DEVIS_DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logger.error('queries.devis', 'getById failed', { id, error });
    throw new AppError('DEVIS_FETCH_FAILED', `Devis ${id} introuvable`, {
      cause: error,
    });
  }
  if (!data) return null;
  const detail = data as unknown as DevisDetail;
  detail.lignes = [...detail.lignes].sort((a, b) => a.ordre - b.ordre);
  return detail;
}
