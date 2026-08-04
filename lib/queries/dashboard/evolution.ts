import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { computeContractSchedule } from '@/lib/queries/production';
import { getContratsActifs } from '@/lib/queries/production-aggregates';
import { encaisseHt } from '@/lib/utils/montant-ht';
import { soldeNetHt, soldeNetTtc } from '@/lib/utils/avoir-netting';
import { previousPeriode, type Periode } from '@/lib/utils/dashboard-periode';

/**
 * Valeurs M-1 du tableau "Evolution M / M-1" et du chip "vs M-1", calculees
 * EN LIVE sur la fenetre precedente - comparables terme a terme aux valeurs
 * courantes de getDashboardFinancials(periode) :
 *  - production : commission theorique du mois precedent (meme schedule) ;
 *  - facture    : factures emises sur la fenetre M-1 (net des avoirs) ;
 *  - encaisse   : paiements recus sur la fenetre M-1 (ramenes en HT) ;
 *  - enRetard   : STOCK en retard reconstitue a la frontiere de la fenetre
 *    courante (debut de periode) - une facture echue avant cette date, nette
 *    des avoirs emis et des paiements recus avant cette date.
 *
 * Remplace l'ancien proxy base sur kpi_snapshots (production M-1 aliasee sur
 * total_facture_ht cumule, en retard M-1 = facture - encaisse cumules) qui
 * comparait des flux mensuels a des cumuls a date.
 */
export interface PreviousPeriodFinancials {
  production: number;
  facture: number;
  encaisse: number;
  enRetard: number;
  // Equivalents TTC (montant_ttc factures = valeurs PDF, paiements bruts).
  productionTtc: number;
  factureTtc: number;
  encaisseTtc: number;
  enRetardTtc: number;
  label: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getPreviousPeriodFinancials(
  periode: Periode,
): Promise<PreviousPeriodFinancials> {
  const supabase = await createClient();
  const prev = previousPeriode(periode);
  const prevFromStr = prev.from.toISOString().slice(0, 10);
  const prevToStr = prev.to.toISOString().slice(0, 10);
  const prevMonthKey = prevFromStr.slice(0, 7);
  // Frontiere du stock "en retard" : debut de la fenetre courante.
  const boundaryStr = periode.from.toISOString().slice(0, 10);

  const [contratsProd, facturesRes, paiementsRes, retardRes] =
    await Promise.all([
      getContratsActifs(supabase, prevMonthKey, prevMonthKey),
      supabase
        .from('factures')
        .select(
          'montant_ht, montant_ttc, projet:projets!factures_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
        )
        .in('statut', ['emise', 'payee', 'en_retard', 'avoir'])
        .gte('date_emission', prevFromStr)
        .lte('date_emission', prevToStr)
        .eq('projet.client.is_demo', false)
        .eq('projet.client.archive', false),
      supabase
        .from('paiements')
        .select(
          'montant, facture:factures!paiements_facture_id_fkey!inner(montant_ht, montant_ttc, projet:projets!factures_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive)))',
        )
        .gte('date_reception', prevFromStr)
        .lte('date_reception', prevToStr)
        .eq('facture.projet.client.is_demo', false)
        .eq('facture.projet.client.archive', false),
      // Stock en retard a la frontiere : factures emises avant la frontiere,
      // echues avant la frontiere. Paiements et avoirs sont re-filtres par
      // date en JS (le statut actuel - payee depuis - ne compte pas ici).
      supabase
        .from('factures')
        .select(
          'montant_ht, montant_ttc, paiements(montant, date_reception), avoirs:factures!facture_origine_id(montant_ht, montant_ttc, statut, date_emission), projet:projets!factures_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
        )
        .neq('statut', 'a_emettre')
        .eq('est_avoir', false)
        .lt('date_emission', boundaryStr)
        .lt('date_echeance', boundaryStr)
        .eq('projet.client.is_demo', false)
        .eq('projet.client.archive', false),
    ]);

  for (const [name, res] of [
    ['factures', facturesRes],
    ['paiements', paiementsRes],
    ['retard', retardRes],
  ] as const) {
    if (res.error) {
      logger.error(
        'queries.dashboard',
        `getPreviousPeriodFinancials failed (${name})`,
        { error: res.error },
      );
    }
  }

  let production = 0;
  for (const c of contratsProd) {
    if (!c.date_debut || !c.duree_mois || c.duree_mois <= 0) continue;
    if (!c.npec_amount || c.npec_amount <= 0) continue;
    const schedule = computeContractSchedule(
      c.date_debut,
      c.duree_mois,
      c.npec_amount,
      c.taux_commission ?? 0,
    );
    for (const e of schedule.soluvia) {
      if (e.month === prevMonthKey) production += e.amount;
    }
  }

  const facture = (facturesRes.data ?? []).reduce(
    (s, f) => s + (f.montant_ht ?? 0),
    0,
  );
  const factureTtc = (facturesRes.data ?? []).reduce(
    (s, f) => s + (f.montant_ttc ?? 0),
    0,
  );

  const encaisse = (paiementsRes.data ?? []).reduce((s, p) => {
    const f = p.facture as { montant_ht: number; montant_ttc: number } | null;
    return s + encaisseHt(p.montant, f?.montant_ht ?? 0, f?.montant_ttc ?? 0);
  }, 0);
  const encaisseTtc = (paiementsRes.data ?? []).reduce(
    (s, p) => s + (p.montant ?? 0),
    0,
  );

  let enRetard = 0;
  let enRetardTtc = 0;
  for (const f of retardRes.data ?? []) {
    const avoirsAvant = (
      Array.isArray(f.avoirs) ? f.avoirs : f.avoirs ? [f.avoirs] : []
    ).filter(
      (a: { date_emission: string | null }) =>
        a.date_emission != null && a.date_emission < boundaryStr,
    );
    const solde = soldeNetHt(f.montant_ht, avoirsAvant);
    if (solde <= 0) continue;
    const paiements = Array.isArray(f.paiements) ? f.paiements : [];
    const paiementsAvantTtc = paiements
      .filter(
        (p: { date_reception: string | null }) =>
          p.date_reception != null && p.date_reception < boundaryStr,
      )
      .reduce((s: number, p: { montant: number }) => s + p.montant, 0);
    const dejaEncaisse = encaisseHt(
      paiementsAvantTtc,
      f.montant_ht,
      f.montant_ttc,
    );
    enRetard += Math.max(0, solde - dejaEncaisse);
    const soldeTtc = soldeNetTtc(f.montant_ttc, avoirsAvant);
    enRetardTtc += Math.max(0, soldeTtc - paiementsAvantTtc);
  }

  return {
    production: round2(production),
    facture: round2(facture),
    encaisse: round2(encaisse),
    enRetard: round2(enRetard),
    // Commission TTC-native : le x1.2 restitue le TTC contractuel exact.
    productionTtc: round2(production * 1.2),
    factureTtc: round2(factureTtc),
    encaisseTtc: round2(encaisseTtc),
    enRetardTtc: round2(enRetardTtc),
    label: prev.label,
  };
}
