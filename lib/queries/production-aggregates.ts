import { addMonths, format } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { fetchAllRows } from '@/lib/supabase/fetch-all';
import { logger } from '@/lib/utils/logger';
import { encaisseHt } from '@/lib/utils/montant-ht';
import { soldeRestantDuHt, soldeRestantDuTtc } from '@/lib/utils/avoir-netting';

/**
 * Agregats production : sommes mensuelles factures/paiements + contrats
 * actifs. Source unique partagee entre getProductionData (production),
 * getMonthlyTrend / getDashboardFinancials (dashboard) et le cron rapport
 * mensuel, qui dupliquaient le meme trio de requetes ligne a ligne.
 *
 * Chemin nominal : RPC SQL (production_month_sums / contrats_actifs_fenetre,
 * migration 20260702130000). SECURITY INVOKER => la RLS de l'appelant
 * s'applique, scoping identique aux selects PostgREST remplaces (cdp = ses
 * projets, admin = global, cron admin client = service role RLS bypass).
 *
 * Fallback transparent sur l'ancien chemin fetchAllRows si la RPC est
 * indisponible (fenetre de deploiement avant application de la migration en
 * prod, code PGRST202) : memes requetes, memes filtres, memes sommes.
 *
 * INVARIANT : la production theorique reste calculee en JS via
 * computeContractSchedule (lib/queries/production.ts = source unique). Ici on
 * ne fait que sommer factures/paiements et charger les contrats ; les sommes
 * sont brutes (round2 reste applique par les consommateurs a l'assemblage).
 */

type Supabase = SupabaseClient<Database>;

export interface MonthSums {
  facture: number;
  en_retard: number;
  encaisse: number;
  // Equivalents TTC : sommes des montant_ttc factures (valeurs PDF) et
  // paiements bruts - zero recalcul, zero derive de centimes.
  factureTtc: number;
  enRetardTtc: number;
  encaisseTtc: number;
}

export interface ContratActifRow {
  /** YYYY-MM-DD */
  date_debut: string | null;
  duree_mois: number | null;
  npec_amount: number | null;
  taux_commission: number | null;
  /** YYYY-MM-DD : tronque la production theorique. null = contrat non rompu. */
  date_rupture: string | null;
}

// ---------------------------------------------------------------------------
// Sommes mensuelles facture / en_retard / encaisse (HT)
// ---------------------------------------------------------------------------

/**
 * Map mois 'YYYY-MM' -> sommes du mois sur [firstKey, nextAfterLastKey).
 * Bornes COURTES 'YYYY-MM' obligatoires : mois_concerne est un TEXT a formats
 * mixtes ('YYYY-MM' event-based, 'YYYY-MM-01' echeancier) et seule la
 * comparaison lexicographique avec bornes courtes est correcte pour les deux.
 */
export async function getMonthSums(
  supabase: Supabase,
  firstKey: string,
  nextAfterLastKey: string,
): Promise<Map<string, MonthSums>> {
  try {
    const { data, error } = await supabase.rpc('production_month_sums', {
      p_first: firstKey,
      p_next: nextAfterLastKey,
    });
    if (!error) {
      const map = new Map<string, MonthSums>();
      for (const r of data ?? []) {
        map.set(r.mois, {
          facture: Number(r.facture),
          en_retard: Number(r.en_retard),
          encaisse: Number(r.encaisse),
          factureTtc: Number(r.facture_ttc ?? 0),
          enRetardTtc: Number(r.en_retard_ttc ?? 0),
          encaisseTtc: Number(r.encaisse_ttc ?? 0),
        });
      }
      return map;
    }
    logger.warn(
      'queries.production-aggregates',
      'RPC production_month_sums indisponible, fallback fetchAllRows',
      { error },
    );
  } catch (error) {
    logger.warn(
      'queries.production-aggregates',
      'RPC production_month_sums indisponible, fallback fetchAllRows',
      { error },
    );
  }
  return getMonthSumsFallback(supabase, firstKey, nextAfterLastKey);
}

/** Ancien chemin ligne a ligne (ex-getProductionData) : memes filtres que la RPC. */
async function getMonthSumsFallback(
  supabase: Supabase,
  firstKey: string,
  nextAfterLastKey: string,
): Promise<Map<string, MonthSums>> {
  // Exclude clients demo (is_demo=true) et archives : leurs factures gonflent
  // les KPIs sans correspondre a de la production reelle. !inner force la
  // jointure cote SQL pour que le filtre s'applique reellement.
  // statut <> 'a_emettre' (memes regles que la RPC) : brouillons exclus,
  // avoirs emis INCLUS en negatif => "facture" est net des avoirs. Le solde
  // "en_retard" deduit les avoirs lies (une facture totalement soldee par
  // avoir ne pese plus dans le retard) : les avoirs heritent du mois_concerne
  // de leur origine, donc ils sont toujours dans la meme fenetre.
  // fetchAllRows + .order('id') : PostgREST tronque silencieusement a
  // max_rows (1000) sans pagination.
  const [facturesRes, paiementsRes] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from('factures')
        .select(
          'id, montant_ht, montant_ttc, statut, est_avoir, facture_origine_id, mois_concerne, client:clients!inner(is_demo, archive)',
        )
        .gte('mois_concerne', firstKey)
        .lt('mois_concerne', nextAfterLastKey)
        .neq('statut', 'a_emettre')
        .eq('client.is_demo', false)
        .eq('client.archive', false)
        .order('id')
        .range(from, to),
    ),

    fetchAllRows((from, to) =>
      supabase
        .from('paiements')
        .select(
          'montant, facture_id, facture:factures!inner(mois_concerne, montant_ht, montant_ttc, client:clients!inner(is_demo, archive))',
        )
        .gte('facture.mois_concerne', firstKey)
        .lt('facture.mois_concerne', nextAfterLastKey)
        .eq('facture.client.is_demo', false)
        .eq('facture.client.archive', false)
        .order('id')
        .range(from, to),
    ),
  ]);

  if (facturesRes.error)
    logger.error(
      'queries.production-aggregates',
      'getMonthSums fallback failed (factures)',
      { error: facturesRes.error },
    );
  if (paiementsRes.error)
    logger.error(
      'queries.production-aggregates',
      'getMonthSums fallback failed (paiements)',
      { error: paiementsRes.error },
    );

  const map = new Map<string, MonthSums>();
  const entry = (key: string): MonthSums => {
    let e = map.get(key);
    if (!e) {
      e = {
        facture: 0,
        en_retard: 0,
        encaisse: 0,
        factureTtc: 0,
        enRetardTtc: 0,
        encaisseTtc: 0,
      };
      map.set(key, e);
    }
    return e;
  };

  const facturesRows = facturesRes.data ?? [];
  const avoirByOrigine = new Map<string, { ht: number; ttc: number }>();
  for (const f of facturesRows) {
    if (f.est_avoir && f.statut === 'avoir' && f.facture_origine_id) {
      const prev = avoirByOrigine.get(f.facture_origine_id) ?? {
        ht: 0,
        ttc: 0,
      };
      avoirByOrigine.set(f.facture_origine_id, {
        ht: prev.ht + f.montant_ht,
        ttc: prev.ttc + (f.montant_ttc ?? 0),
      });
    }
  }

  // Paiements deja recus, par facture. Necessaire pour que « En retard » soit
  // le RESTANT DU et non le montant facture brut : c'est la definition unique
  // retenue par l'audit #122, constat 13 (cf lib/utils/avoir-netting).
  const paiementsParFacture = new Map<string, number>();
  for (const p of paiementsRes.data ?? []) {
    const id = (p as { facture_id?: string }).facture_id;
    if (!id) continue;
    paiementsParFacture.set(
      id,
      (paiementsParFacture.get(id) ?? 0) + (p.montant ?? 0),
    );
  }

  for (const f of facturesRows) {
    if (!f.mois_concerne) continue;
    const e = entry(f.mois_concerne.slice(0, 7));
    e.facture += f.montant_ht;
    e.factureTtc += f.montant_ttc ?? 0;
    if (f.statut === 'en_retard') {
      const av = avoirByOrigine.get(f.id);
      const encaisseTtc = paiementsParFacture.get(f.id) ?? 0;
      const avoirs = av
        ? [{ montant_ht: av.ht, montant_ttc: av.ttc, statut: 'avoir' as const }]
        : [];
      e.en_retard += soldeRestantDuHt(
        f.montant_ht,
        f.montant_ttc,
        avoirs,
        encaisseTtc,
      );
      e.enRetardTtc += soldeRestantDuTtc(f.montant_ttc, avoirs, encaisseTtc);
    }
  }

  for (const p of paiementsRes.data ?? []) {
    const facture = p.facture as {
      mois_concerne: string | null;
      montant_ht: number;
      montant_ttc: number;
    } | null;
    if (!facture?.mois_concerne) continue;
    const e = entry(facture.mois_concerne.slice(0, 7));
    e.encaisse += encaisseHt(
      p.montant,
      facture.montant_ht,
      facture.montant_ttc,
    );
    e.encaisseTtc += p.montant ?? 0;
  }

  return map;
}

// ---------------------------------------------------------------------------
// Contrats actifs (fenetre de contribution)
// ---------------------------------------------------------------------------

/**
 * Contrats actifs (non archives, client non demo/non archive) susceptibles de
 * contribuer a la fenetre [firstKey, lastKey] ('YYYY-MM' inclusifs). La RPC
 * pre-filtre en SQL sur date_debut < mois suivant lastKey ET fin theorique
 * (date_debut + duree_mois + 2 mois, le +2 couvre le versement OPCO a
 * M+duree+1) >= firstKey : sur-ensemble strict des contrats contributeurs.
 * Le calcul de l'echeancier reste en JS (computeContractSchedule).
 */
export async function getContratsActifs(
  supabase: Supabase,
  firstKey: string,
  lastKey: string,
  /**
   * Mode strict : leve si la RPC ET son repli echouent, au lieu de renvoyer
   * `[]`. Les ecrans preferent une donnee degradee a une page blanche, mais un
   * rapport envoye par mail ne doit JAMAIS annoncer zero pour une panne : le
   * destinataire n'a aucun moyen de faire la difference.
   */
  opts?: { strict?: boolean },
): Promise<ContratActifRow[]> {
  const pFirst = `${firstKey}-01`;
  const pNext = `${format(addMonths(new Date(`${lastKey}-01T00:00:00`), 1), 'yyyy-MM')}-01`;
  try {
    const { data, error } = await supabase.rpc('contrats_actifs_fenetre', {
      p_first: pFirst,
      p_next: pNext,
    });
    if (!error) return data ?? [];
    logger.warn(
      'queries.production-aggregates',
      'RPC contrats_actifs_fenetre indisponible, fallback fetchAllRows',
      { error },
    );
  } catch (error) {
    logger.warn(
      'queries.production-aggregates',
      'RPC contrats_actifs_fenetre indisponible, fallback fetchAllRows',
      { error },
    );
  }
  const fallback = await getContratsActifsFallback(supabase, opts);
  return fallback;
}

/**
 * Ancien chemin ligne a ligne : tous les contrats actifs (sans filtre
 * fenetre, comme les selects remplaces - les mois hors fenetre ne sont
 * simplement jamais lus a l'assemblage).
 */
async function getContratsActifsFallback(
  supabase: Supabase,
  opts?: { strict?: boolean },
): Promise<ContratActifRow[]> {
  const contratsRes = await fetchAllRows((from, to) =>
    supabase
      .from('contrats')
      .select(
        'date_debut, duree_mois, npec_amount, date_rupture, projet:projets!contrats_projet_id_fkey!inner(taux_commission, client:clients!projets_client_id_fkey!inner(is_demo, archive))',
      )
      .eq('archive', false)
      .eq('projet.client.is_demo', false)
      .eq('projet.client.archive', false)
      .order('id')
      .range(from, to),
  );

  if (contratsRes.error) {
    logger.error(
      'queries.production-aggregates',
      'getContratsActifs fallback failed (contrats)',
      { error: contratsRes.error },
    );
    // En strict, la RPC a deja echoue plus haut : ce repli etait le dernier
    // recours. Renvoyer `[]` ferait passer une panne pour une production nulle.
    if (opts?.strict) {
      throw new Error(
        `getContratsActifs : RPC et repli en echec (${contratsRes.error.message})`,
      );
    }
  }

  const rows: ContratActifRow[] = [];
  for (const c of contratsRes.data ?? []) {
    const projet = c.projet as { taux_commission: number | null } | null;
    if (!projet) continue;
    rows.push({
      date_debut: c.date_debut,
      duree_mois: c.duree_mois,
      npec_amount: c.npec_amount,
      taux_commission: projet.taux_commission,
      date_rupture: c.date_rupture,
    });
  }
  return rows;
}
