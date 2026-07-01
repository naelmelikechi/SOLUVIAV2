import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';
import type { Database } from '@/types/database';

type FactureRow = Database['public']['Tables']['factures']['Row'];
type ProjetRow = Database['public']['Tables']['projets']['Row'];
type ClientRow = Database['public']['Tables']['clients']['Row'];

// Projection partagee par la liste paginee (getFacturesPage) et l'export.
// `as const` : preserve le type litteral pour l'inference PostgREST du .select.
const FACTURES_LIST_SELECT = `
      id, ref, numero_seq, date_emission, date_echeance, mois_concerne,
      montant_ht, taux_tva, montant_tva, montant_ttc,
      statut, est_avoir, avoir_motif, facture_origine_id,
      projet:projets!factures_projet_id_fkey(id, ref),
      client:clients!factures_client_id_fkey!inner(id, trigramme, raison_sociale, is_demo, archive)
    ` as const;

// Projection minimale pour le count exact (page 1) : embeds requis pour que
// les filtres embedded (client.archive, projet.ref) restent applicables.
const FACTURES_COUNT_SELECT = `
      id,
      projet:projets!factures_projet_id_fkey(id),
      client:clients!factures_client_id_fkey!inner(id)
    ` as const;

// Type public de la liste des factures (colonnes + joins projet/client).
// Nomme explicitement (pas d'inference via ReturnType) pour servir de contrat
// stable aux colonnes de la DataTable et a l'export.
export interface FactureListItem {
  id: FactureRow['id'];
  ref: FactureRow['ref'];
  numero_seq: FactureRow['numero_seq'];
  date_emission: FactureRow['date_emission'];
  date_echeance: FactureRow['date_echeance'];
  mois_concerne: FactureRow['mois_concerne'];
  montant_ht: FactureRow['montant_ht'];
  taux_tva: FactureRow['taux_tva'];
  montant_tva: FactureRow['montant_tva'];
  montant_ttc: FactureRow['montant_ttc'];
  statut: FactureRow['statut'];
  est_avoir: FactureRow['est_avoir'];
  avoir_motif: FactureRow['avoir_motif'];
  facture_origine_id: FactureRow['facture_origine_id'];
  projet: Pick<ProjetRow, 'id' | 'ref'> | null;
  client: Pick<
    ClientRow,
    'id' | 'trigramme' | 'raison_sociale' | 'is_demo' | 'archive'
  >;
}

// Statuts filtrables cote UI (tous les statuts emis ; a_emettre exclu).
export type FactureStatutFiltrable = 'emise' | 'payee' | 'en_retard' | 'avoir';

export interface FacturesPageParams {
  limit?: number; // defaut 25 ; borne [1, 100]
  cursor?: string | null; // base64url({ s: numero_seq, i: id }) ; null = page 1
  statuts?: FactureStatutFiltrable[]; // [] = tous (sauf a_emettre)
  searchRef?: string; // ilike sur ref (omnibox)
  filterProjet?: string; // ilike sur projet.ref
  filterClient?: string; // ilike sur client.raison_sociale
}

export interface FacturesPage {
  rows: FactureListItem[];
  nextCursor: string | null;
  total: number | null; // calcule page 1 uniquement, sinon null
}

// Curseur opaque : encapsule le tuple keyset (numero_seq, id). L'UI ne raisonne
// jamais dessus. Valide par zod cote serveur (curseur invalide -> page 1).
const cursorSchema = z.object({ s: z.number().int(), i: z.string().uuid() });
type FactureCursor = z.infer<typeof cursorSchema>;

export function encodeCursor(cursor: FactureCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeCursor(
  raw: string | null | undefined,
): FactureCursor | undefined {
  if (!raw) return undefined;
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')),
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// getFacturesPage : pagination serveur keyset (numero_seq DESC, id DESC).
// Cout borne a une page quelle que soit la taille de l'historique (append-only).
// Filtres/recherche pousses cote serveur. Count exact page 1 uniquement.
// ---------------------------------------------------------------------------
export async function getFacturesPage(
  params: FacturesPageParams = {},
): Promise<FacturesPage> {
  const supabase = await createClient();
  const limit = Math.min(100, Math.max(1, params.limit ?? 25));

  let q = supabase
    .from('factures')
    .select(FACTURES_LIST_SELECT)
    .eq('client.archive', false)
    .neq('statut', 'a_emettre');

  if (params.statuts?.length) q = q.in('statut', params.statuts);
  if (params.searchRef?.trim())
    q = q.ilike('ref', `%${params.searchRef.trim()}%`);
  if (params.filterProjet?.trim())
    q = q.ilike('projet.ref', `%${params.filterProjet.trim()}%`);
  if (params.filterClient?.trim())
    q = q.ilike('client.raison_sociale', `%${params.filterClient.trim()}%`);

  const cursor = decodeCursor(params.cursor);
  if (cursor)
    q = q.or(
      `numero_seq.lt.${cursor.s},and(numero_seq.eq.${cursor.s},id.lt.${cursor.i})`,
    );

  const { data, error } = await q
    .order('numero_seq', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (error) {
    logger.error('queries.factures', 'getFacturesPage failed', { error });
    throw new AppError(
      'FACTURES_FETCH_FAILED',
      'Impossible de charger les factures',
      { cause: error },
    );
  }

  const fetched = data ?? [];
  const hasMore = fetched.length > limit;
  const rows = hasMore ? fetched.slice(0, limit) : fetched;
  const last = rows.at(-1);
  const nextCursor =
    hasMore && last && last.numero_seq !== null
      ? encodeCursor({ s: last.numero_seq, i: last.id })
      : null;

  // Count exact page 1 uniquement (curseur absent OU invalide -> on repart
  // page 1, donc on recompte). Le total ne change pas pendant la navigation
  // keyset. Memes filtres que la requete de donnees.
  let total: number | null = null;
  if (!cursor) {
    let cq = supabase
      .from('factures')
      .select(FACTURES_COUNT_SELECT, { count: 'exact', head: true })
      .eq('client.archive', false)
      .neq('statut', 'a_emettre');
    if (params.statuts?.length) cq = cq.in('statut', params.statuts);
    if (params.searchRef?.trim())
      cq = cq.ilike('ref', `%${params.searchRef.trim()}%`);
    if (params.filterProjet?.trim())
      cq = cq.ilike('projet.ref', `%${params.filterProjet.trim()}%`);
    if (params.filterClient?.trim())
      cq = cq.ilike('client.raison_sociale', `%${params.filterClient.trim()}%`);
    const { count } = await cq;
    total = count ?? 0;
  }

  return { rows, nextCursor, total };
}

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
      objet, conditions_reglement,
      projet:projets!factures_projet_id_fkey(id, ref),
      client:clients!factures_client_id_fkey(id, trigramme, raison_sociale, is_demo),
      lignes:facture_lignes(id, description, montant_ht, event_type, event_source_id,
        contrat:contrats!facture_lignes_contrat_id_fkey(ref, contract_number, apprenant_nom, apprenant_prenom))
    `,
    )
    .eq('statut', 'a_emettre')
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) {
    logger.error('queries.factures', 'getBrouillons failed', { error });
    return [];
  }
  if (data?.length === 500) {
    logger.warn('queries.factures', 'brouillons > 500, possible backlog');
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
    .eq('est_libre', false)
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
      societe_emettrice_id, odoo_id,
      projet:projets!factures_projet_id_fkey(id, ref),
      client:clients!factures_client_id_fkey(id, trigramme, raison_sociale, siret, adresse, localisation, tva_intracommunautaire),
      lignes:facture_lignes(id, contrat_id, description, montant_ht, opco_code, contrat:contrats!facture_lignes_contrat_id_fkey(ref, contract_number, apprenant_nom, apprenant_prenom))
    `,
    )
    .eq('ref', ref)
    .order('ordre', { foreignTable: 'lignes', nullsFirst: false })
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
      societe_emettrice_id, odoo_id,
      projet:projets!factures_projet_id_fkey(id, ref),
      client:clients!factures_client_id_fkey(id, trigramme, raison_sociale, siret, adresse, localisation, tva_intracommunautaire),
      lignes:facture_lignes(id, contrat_id, description, montant_ht, opco_code, contrat:contrats!facture_lignes_contrat_id_fkey(ref, contract_number, apprenant_nom, apprenant_prenom))
    `,
    )
    .eq('id', id)
    .order('ordre', { foreignTable: 'lignes', nullsFirst: false })
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
      projet:projets!echeances_projet_id_fkey(id, ref, client:clients!projets_client_id_fkey(trigramme, raison_sociale, tva_intracommunautaire))
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
