'use server';

import { logger } from '@/lib/utils/logger';
import { requireAuth } from '@/lib/auth/guards';
import { fetchAllRows } from '@/lib/supabase/fetch-all';
import {
  aggregateMonthByProjet,
  rollupByClient,
  projectByProjet,
  nextMonthKey,
  type ContratInput,
  type FactureInput,
  type PaiementInput,
  type ProductionByClientRow,
  type ProductionByProjetRow,
} from '@/lib/queries/production-rollup';
import type { createClient } from '@/lib/supabase/server';

export type {
  ProductionByClientRow,
  ProductionByProjetRow,
} from '@/lib/queries/production-rollup';

/**
 * Resultat discrimine : l'UI (monthly-view) doit pouvoir distinguer "mois
 * vide" d'une erreur (auth ou DB) pour ne pas mettre en cache un vide errone
 * et afficher un toast. Retourner [] sur erreur masquait les deux cas.
 */
export type ProductionFetchResult<T> =
  | { success: true; rows: T[] }
  | { success: false; error: string };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// Fetch commun aux deux niveaux du drill-down (par client / par projet).
//
// - Bornes de mois COURTES [monthKey, nextMonthKey) : mois_concerne est un
//   TEXT a formats mixtes ('YYYY-MM' event-based, 'YYYY-MM-01' echeancier) ;
//   des bornes 'YYYY-MM-01' excluent lexicographiquement les factures
//   'YYYY-MM' de leur propre mois. Voir nextMonthKey().
// - statut <> 'a_emettre' : brouillons exclus, avoirs emis inclus en negatif
//   (le "Facture" du drill-down est net des avoirs, aligne sur la RPC
//   production_month_sums) ; le solde en retard deduit les avoirs lies.
// - clientId optionnel pousse le filtre cote SQL (pas de filtrage JS sur la
//   table entiere).
// - fetchAllRows + .order('id') : PostgREST tronque silencieusement a
//   max_rows (1000) sans pagination.
// ---------------------------------------------------------------------------

const PROJET_EMBED = `
  projet:projets!inner (
    id,
    ref,
    client_id,
    taux_commission,
    client:clients!projets_client_id_fkey!inner (
      id,
      raison_sociale,
      is_demo,
      archive
    )
  )
`;

async function fetchMonthProduction(
  supabase: SupabaseServerClient,
  monthKey: string,
  clientId?: string,
): Promise<
  | {
      ok: true;
      contrats: ContratInput[];
      factures: FactureInput[];
      paiements: PaiementInput[];
    }
  | { ok: false; error: string }
> {
  const monthStart = monthKey;
  const monthEnd = nextMonthKey(monthKey);

  const [facturesRes, paiementsRes, contratsRes] = await Promise.all([
    fetchAllRows((from, to) => {
      let q = supabase
        .from('factures')
        .select(
          `id, montant_ht, montant_ttc, statut, est_avoir, facture_origine_id, ${PROJET_EMBED}`,
        )
        .gte('mois_concerne', monthStart)
        .lt('mois_concerne', monthEnd)
        .neq('statut', 'a_emettre')
        .eq('projet.client.is_demo', false)
        .eq('projet.client.archive', false);
      if (clientId) q = q.eq('projet.client_id', clientId);
      return q.order('id').range(from, to);
    }),

    fetchAllRows((from, to) => {
      let q = supabase
        .from('paiements')
        .select(
          `
          montant,
          facture:factures!paiements_facture_id_fkey!inner (
            id,
            mois_concerne,
            montant_ht,
            montant_ttc,
            projet_id,
            projet:projets!inner (
              client_id,
              client:clients!projets_client_id_fkey!inner (
                is_demo,
                archive
              )
            )
          )
        `,
        )
        .gte('facture.mois_concerne', monthStart)
        .lt('facture.mois_concerne', monthEnd)
        .eq('facture.projet.client.is_demo', false)
        .eq('facture.projet.client.archive', false);
      if (clientId) q = q.eq('facture.projet.client_id', clientId);
      return q.order('id').range(from, to);
    }),

    fetchAllRows((from, to) => {
      let q = supabase
        .from('contrats')
        .select(
          `date_debut, duree_mois, npec_amount, date_rupture, ${PROJET_EMBED}`,
        )
        .eq('archive', false)
        .eq('projet.client.is_demo', false)
        .eq('projet.client.archive', false);
      if (clientId) q = q.eq('projet.client_id', clientId);
      return q.order('id').range(from, to);
    }),
  ]);

  // Toute erreur invalide le mois entier : afficher des chiffres partiels
  // (ex. facture sans encaisse) serait pire qu'une erreur explicite.
  const failed =
    facturesRes.error ?? paiementsRes.error ?? contratsRes.error ?? null;
  if (failed) {
    logger.error('actions.production', 'fetchMonthProduction failed', {
      monthKey,
      clientId,
      facturesError: facturesRes.error,
      paiementsError: paiementsRes.error,
      contratsError: contratsRes.error,
    });
    return { ok: false, error: 'Erreur lors du chargement des données' };
  }

  return {
    ok: true,
    contrats: contratsRes.data as unknown as ContratInput[],
    factures: facturesRes.data as unknown as FactureInput[],
    paiements: paiementsRes.data as unknown as PaiementInput[],
  };
}

// ---------------------------------------------------------------------------
// fetchProductionByClient - breakdown of a month by client
// ---------------------------------------------------------------------------

export async function fetchProductionByClient(
  mois: string,
): Promise<ProductionFetchResult<ProductionByClientRow>> {
  // requireAuth (et non checkAuth admin-only) : la page /production est
  // visible des CDP et la RLS filtre deja leurs donnees ; le drill-down doit
  // suivre la meme regle que les totaux de la page.
  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };

  const raw = await fetchMonthProduction(auth.supabase, mois.slice(0, 7));
  if (!raw.ok) return { success: false, error: raw.error };

  const projetMap = aggregateMonthByProjet(
    mois.slice(0, 7),
    raw.contrats,
    raw.factures,
    raw.paiements,
  );
  return { success: true, rows: rollupByClient(projetMap) };
}

// ---------------------------------------------------------------------------
// fetchProductionByProjet - breakdown of a month + client by projet
// ---------------------------------------------------------------------------

export async function fetchProductionByProjet(
  mois: string,
  clientId: string,
): Promise<ProductionFetchResult<ProductionByProjetRow>> {
  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };

  const raw = await fetchMonthProduction(
    auth.supabase,
    mois.slice(0, 7),
    clientId,
  );
  if (!raw.ok) return { success: false, error: raw.error };

  const projetMap = aggregateMonthByProjet(
    mois.slice(0, 7),
    raw.contrats,
    raw.factures,
    raw.paiements,
  );
  return { success: true, rows: projectByProjet(projetMap) };
}
