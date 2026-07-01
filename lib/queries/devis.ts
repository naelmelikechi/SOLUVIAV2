import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
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
    localisation: string | null;
    siret: string | null;
    tva_intracommunautaire: string | null;
  } | null;
  societe_emettrice: {
    id: string;
    code: string;
    raison_sociale: string;
    forme_juridique: string | null;
    capital_social: number | null;
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

/**
 * Projection minimale consommee par components/devis/devis-pdf.tsx.
 *
 * Sur-ensemble structurel : `DevisDetail` reste assignable a ce type (les
 * routes PDF authentifiees passent un `DevisDetail` sans changement). La route
 * publique, elle, ne dispose que de la sortie de la RPC `get_devis_pdf_public`
 * (mappee par `mapDevisPdfPublic`), qui n'expose que ces champs -- jamais
 * notes_internes, acceptation_*, ni ids internes.
 */
export interface DevisPdfData {
  ref: string | null;
  objet: string;
  date_emission: string | null;
  date_validite: string | null;
  montant_ht: number;
  montant_ttc: number;
  conditions_reglement: string | null;
  lignes: Array<{
    ordre: number;
    libelle: string;
    description: string | null;
    quantite: number;
    prix_unitaire_ht: number;
    taux_tva: number;
    total_ht: number;
    total_tva: number;
  }>;
  societe_emettrice: {
    raison_sociale: string;
    forme_juridique: string | null;
    capital_social: number | null;
    siret: string;
    tva_intracom: string;
    adresse: string;
    code_postal: string;
    ville: string;
    logo_url: string | null;
    conditions_reglement_default: string | null;
    mentions_legales: string | null;
    banque_nom: string | null;
    banque_iban: string | null;
    banque_bic: string | null;
  } | null;
  client: {
    raison_sociale: string;
    adresse: string | null;
    localisation: string | null;
    siret: string | null;
    tva_intracommunautaire: string | null;
  } | null;
}

const DevisPdfPublicSchema = z.object({
  devis: z.object({
    ref: z.string().nullable(),
    objet: z.string(),
    date_emission: z.string().nullable(),
    date_validite: z.string().nullable(),
    montant_ht: z.number(),
    montant_ttc: z.number(),
    conditions_reglement: z.string().nullable(),
  }),
  lignes: z.array(
    z.object({
      ordre: z.number(),
      libelle: z.string(),
      description: z.string().nullable(),
      quantite: z.number(),
      prix_unitaire_ht: z.number(),
      taux_tva: z.number(),
      total_ht: z.number(),
      total_tva: z.number(),
    }),
  ),
  societe: z
    .object({
      raison_sociale: z.string(),
      forme_juridique: z.string().nullable(),
      capital_social: z.number().nullable(),
      siret: z.string(),
      tva_intracom: z.string(),
      adresse: z.string(),
      code_postal: z.string(),
      ville: z.string(),
      logo_url: z.string().nullable(),
      conditions_reglement_default: z.string().nullable(),
      mentions_legales: z.string().nullable(),
      banque_nom: z.string().nullable(),
      banque_iban: z.string().nullable(),
      banque_bic: z.string().nullable(),
    })
    .nullable(),
  client: z
    .object({
      raison_sociale: z.string(),
      adresse: z.string().nullable(),
      localisation: z.string().nullable(),
      siret: z.string().nullable(),
      tva_intracommunautaire: z.string().nullable(),
    })
    .nullable(),
});

/**
 * Convertit la sortie JSON de la RPC `get_devis_pdf_public` en `DevisPdfData`.
 * Fonction pure (aucune I/O) : leve si la forme du payload est inattendue
 * (colonne renommee cote SQL, RPC absente...) plutot que de rendre un PDF
 * silencieusement tronque.
 */
export function mapDevisPdfPublic(payload: unknown): DevisPdfData {
  const parsed = DevisPdfPublicSchema.parse(payload);
  return {
    ref: parsed.devis.ref,
    objet: parsed.devis.objet,
    date_emission: parsed.devis.date_emission,
    date_validite: parsed.devis.date_validite,
    montant_ht: parsed.devis.montant_ht,
    montant_ttc: parsed.devis.montant_ttc,
    conditions_reglement: parsed.devis.conditions_reglement,
    lignes: parsed.lignes,
    societe_emettrice: parsed.societe,
    client: parsed.client,
  };
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
  client:clients(id, trigramme, raison_sociale, adresse, localisation, siret, tva_intracommunautaire),
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
  detail.lignes = detail.lignes.toSorted((a, b) => a.ordre - b.ordre);
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
  detail.lignes = detail.lignes.toSorted((a, b) => a.ordre - b.ordre);
  return detail;
}

/**
 * Compteur pilotage : devis envoyés dont la relance est due (envoi >= 7 jours,
 * relances actives, pas encore acceptés/refusés). RLS = périmètre de l'user.
 */
export async function getDevisARelancerCount(): Promise<number> {
  const supabase = await createClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { count, error } = await supabase
    .from('devis')
    .select('id', { count: 'exact', head: true })
    .eq('statut', 'envoye')
    .eq('relances_actives', true)
    .lte('date_envoi', sevenDaysAgo);
  if (error) {
    logger.error('queries.devis', 'getDevisARelancerCount failed', { error });
    return 0;
  }
  return count ?? 0;
}
