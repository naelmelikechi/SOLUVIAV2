'use server';

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { computeContractSchedule } from '@/lib/queries/production';
import { encaisseHt } from '@/lib/utils/montant-ht';
import { round2 } from '@/lib/utils/number';
import { checkAuth } from '@/lib/auth/guards';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProductionByClientRow {
  clientId: string;
  clientName: string;
  production: number;
  productionSoluvia: number;
  facture: number;
  factureSoluvia: number;
  encaisse: number;
  encaisseSoluvia: number;
  enRetard: number;
  enRetardSoluvia: number;
  nbProjets: number;
}

export interface ProductionByProjetRow {
  projetId: string;
  projetRef: string;
  production: number;
  productionSoluvia: number;
  facture: number;
  factureSoluvia: number;
  encaisse: number;
  encaisseSoluvia: number;
  enRetard: number;
  enRetardSoluvia: number;
  commission: number;
  nbContrats: number;
}

/** Sum of OPCO schedule entries for the contract that fall in monthKey (YYYY-MM). */
function opcoForMonth(
  dateDebutIso: string,
  dureeMois: number,
  npec: number,
  monthKey: string,
): number {
  const schedule = computeContractSchedule(dateDebutIso, dureeMois, npec, 0);
  let total = 0;
  for (const e of schedule.opco) {
    if (e.month === monthKey) total += e.amount;
  }
  return total;
}

/** Sum of SOLUVIA schedule entries for the contract that fall in monthKey. */
function soluviaForMonth(
  dateDebutIso: string,
  dureeMois: number,
  npec: number,
  tauxCommissionPct: number,
  monthKey: string,
): number {
  const schedule = computeContractSchedule(
    dateDebutIso,
    dureeMois,
    npec,
    tauxCommissionPct,
  );
  let total = 0;
  for (const e of schedule.soluvia) {
    if (e.month === monthKey) total += e.amount;
  }
  return total;
}

// ---------------------------------------------------------------------------
// fetchProductionByClient - breakdown of a month by client
// ---------------------------------------------------------------------------

export async function fetchProductionByClient(
  mois: string,
): Promise<ProductionByClientRow[]> {
  const auth = await checkAuth();
  if (!auth.ok) return [];
  const supabase = await createClient();

  const monthKey = mois.slice(0, 7);
  const monthStart = `${monthKey}-01`;
  const nextMonth = new Date(monthStart + 'T00:00:00');
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const monthEnd = nextMonth.toISOString().split('T')[0]!;

  const { data: factures, error: facturesError } = await supabase
    .from('factures')
    .select(
      `
      montant_ht,
      statut,
      projet:projets!factures_projet_id_fkey!inner (
        id,
        client_id,
        client:clients!projets_client_id_fkey!inner (
          id,
          raison_sociale,
          is_demo,
          archive
        )
      )
    `,
    )
    .gte('mois_concerne', monthStart)
    .lt('mois_concerne', monthEnd)
    .neq('statut', 'avoir')
    .eq('projet.client.is_demo', false)
    .eq('projet.client.archive', false);

  if (facturesError) {
    logger.error(
      'actions.production',
      'fetchProductionByClient failed (factures)',
      { error: facturesError },
    );
    return [];
  }

  const { data: paiements, error: paiementsError } = await supabase
    .from('paiements')
    .select(
      `
      montant,
      facture:factures!paiements_facture_id_fkey!inner (
        mois_concerne,
        montant_ht,
        montant_ttc,
        projet:projets!factures_projet_id_fkey!inner (
          id,
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

  if (paiementsError) {
    logger.error(
      'actions.production',
      'fetchProductionByClient failed (paiements)',
      { error: paiementsError },
    );
  }

  const { data: contrats, error: contratsError } = await supabase
    .from('contrats')
    .select(
      `
      date_debut,
      duree_mois,
      npec_amount,
      projet:projets!contrats_projet_id_fkey!inner (
        id,
        client_id,
        taux_commission,
        client:clients!projets_client_id_fkey!inner (
          id,
          raison_sociale,
          is_demo,
          archive
        )
      )
    `,
    )
    .eq('archive', false)
    .eq('projet.client.is_demo', false)
    .eq('projet.client.archive', false);

  if (contratsError) {
    logger.error(
      'actions.production',
      'fetchProductionByClient failed (contrats)',
      { error: contratsError },
    );
  }

  // Per-projet aggregates so we can compute a per-projet OPCO->SOLUVIA ratio
  // for scaling factures / encaissements (factures sont au niveau projet).
  type ProjetAgg = {
    clientId: string;
    clientName: string;
    productionOpco: number;
    productionSoluvia: number;
    facture: number;
    encaisse: number;
    enRetard: number;
  };
  const projetMap = new Map<string, ProjetAgg>();

  function ensureProjet(
    projetId: string,
    clientId: string,
    clientName: string,
  ): ProjetAgg {
    let entry = projetMap.get(projetId);
    if (!entry) {
      entry = {
        clientId,
        clientName,
        productionOpco: 0,
        productionSoluvia: 0,
        facture: 0,
        encaisse: 0,
        enRetard: 0,
      };
      projetMap.set(projetId, entry);
    }
    return entry;
  }

  for (const c of contrats ?? []) {
    if (!c.date_debut || !c.duree_mois || c.duree_mois <= 0) continue;
    if (!c.npec_amount || c.npec_amount <= 0) continue;

    const projet = c.projet as {
      id: string;
      client_id: string;
      taux_commission: number | null;
      client: { id: string; raison_sociale: string } | null;
    } | null;
    if (!projet?.client) continue;

    const tauxCommission = projet.taux_commission ?? 10;

    const opco = opcoForMonth(
      c.date_debut,
      c.duree_mois,
      c.npec_amount,
      monthKey,
    );
    const soluvia = soluviaForMonth(
      c.date_debut,
      c.duree_mois,
      c.npec_amount,
      tauxCommission,
      monthKey,
    );
    if (opco <= 0 && soluvia <= 0) continue;

    const entry = ensureProjet(
      projet.id,
      projet.client.id,
      projet.client.raison_sociale,
    );
    entry.productionOpco += opco;
    entry.productionSoluvia += soluvia;
  }

  for (const f of factures ?? []) {
    const projet = f.projet as {
      id: string;
      client_id: string;
      client: { id: string; raison_sociale: string } | null;
    } | null;
    if (!projet?.client) continue;

    const entry = ensureProjet(
      projet.id,
      projet.client.id,
      projet.client.raison_sociale,
    );
    entry.facture += f.montant_ht;
    if (f.statut === 'en_retard') entry.enRetard += f.montant_ht;
  }

  for (const p of paiements ?? []) {
    const facture = p.facture as {
      mois_concerne: string | null;
      montant_ht: number;
      montant_ttc: number;
      projet: { id: string } | null;
    } | null;
    if (!facture?.mois_concerne || !facture.projet) continue;
    const entry = projetMap.get(facture.projet.id);
    if (entry)
      entry.encaisse += encaisseHt(
        p.montant,
        facture.montant_ht,
        facture.montant_ttc,
      );
  }

  // Aggregate par client en applicant le ratio per-projet aux factures.
  type ClientAgg = {
    clientName: string;
    production: number;
    productionSoluvia: number;
    facture: number;
    factureSoluvia: number;
    encaisse: number;
    encaisseSoluvia: number;
    enRetard: number;
    enRetardSoluvia: number;
    projetIds: Set<string>;
  };
  const clientMap = new Map<string, ClientAgg>();

  for (const [projetId, p] of projetMap) {
    const ratio =
      p.productionOpco > 0 ? p.productionSoluvia / p.productionOpco : 0;
    let client = clientMap.get(p.clientId);
    if (!client) {
      client = {
        clientName: p.clientName,
        production: 0,
        productionSoluvia: 0,
        facture: 0,
        factureSoluvia: 0,
        encaisse: 0,
        encaisseSoluvia: 0,
        enRetard: 0,
        enRetardSoluvia: 0,
        projetIds: new Set<string>(),
      };
      clientMap.set(p.clientId, client);
    }
    client.production += p.productionOpco;
    client.productionSoluvia += p.productionSoluvia;
    client.facture += p.facture;
    client.factureSoluvia += p.facture * ratio;
    client.encaisse += p.encaisse;
    client.encaisseSoluvia += p.encaisse * ratio;
    client.enRetard += p.enRetard;
    client.enRetardSoluvia += p.enRetard * ratio;
    client.projetIds.add(projetId);
  }

  return Array.from(clientMap.entries()).map(([clientId, data]) => ({
    clientId,
    clientName: data.clientName,
    production: round2(data.production),
    productionSoluvia: round2(data.productionSoluvia),
    facture: round2(data.facture),
    factureSoluvia: round2(data.factureSoluvia),
    encaisse: round2(data.encaisse),
    encaisseSoluvia: round2(data.encaisseSoluvia),
    enRetard: round2(data.enRetard),
    enRetardSoluvia: round2(data.enRetardSoluvia),
    nbProjets: data.projetIds.size,
  }));
}

// ---------------------------------------------------------------------------
// fetchProductionByProjet - breakdown of a month + client by projet
// ---------------------------------------------------------------------------

export async function fetchProductionByProjet(
  mois: string,
  clientId: string,
): Promise<ProductionByProjetRow[]> {
  const auth = await checkAuth();
  if (!auth.ok) return [];
  const supabase = await createClient();

  const monthKey = mois.slice(0, 7);
  const monthStart = `${monthKey}-01`;
  const nextMonth = new Date(monthStart + 'T00:00:00');
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const monthEnd = nextMonth.toISOString().split('T')[0]!;

  const { data: factures, error: facturesError } = await supabase
    .from('factures')
    .select(
      `
      montant_ht,
      statut,
      projet_id,
      projet:projets!factures_projet_id_fkey!inner (
        id,
        ref,
        client_id,
        client:clients!projets_client_id_fkey!inner (
          is_demo,
          archive
        )
      )
    `,
    )
    .gte('mois_concerne', monthStart)
    .lt('mois_concerne', monthEnd)
    .neq('statut', 'avoir')
    .eq('projet.client.is_demo', false)
    .eq('projet.client.archive', false);

  if (facturesError) {
    logger.error(
      'actions.production',
      'fetchProductionByProjet failed (factures)',
      { error: facturesError },
    );
    return [];
  }

  const { data: paiements, error: paiementsError } = await supabase
    .from('paiements')
    .select(
      `
      montant,
      facture:factures!paiements_facture_id_fkey!inner (
        mois_concerne,
        montant_ht,
        montant_ttc,
        projet_id,
        projet:projets!factures_projet_id_fkey!inner (
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

  if (paiementsError) {
    logger.error(
      'actions.production',
      'fetchProductionByProjet failed (paiements)',
      { error: paiementsError },
    );
  }

  const { data: contrats, error: contratsError } = await supabase
    .from('contrats')
    .select(
      `
      date_debut,
      duree_mois,
      npec_amount,
      projet:projets!contrats_projet_id_fkey!inner (
        id,
        ref,
        client_id,
        taux_commission,
        client:clients!projets_client_id_fkey!inner (
          is_demo,
          archive
        )
      )
    `,
    )
    .eq('archive', false)
    .eq('projet.client.is_demo', false)
    .eq('projet.client.archive', false);

  if (contratsError) {
    logger.error(
      'actions.production',
      'fetchProductionByProjet failed (contrats)',
      { error: contratsError },
    );
  }

  const projetMap = new Map<
    string,
    {
      projetRef: string;
      production: number;
      productionSoluvia: number;
      facture: number;
      encaisse: number;
      enRetard: number;
      commissions: number[];
      nbContrats: number;
    }
  >();

  for (const c of contrats ?? []) {
    if (!c.date_debut || !c.duree_mois || c.duree_mois <= 0) continue;
    if (!c.npec_amount || c.npec_amount <= 0) continue;

    const projet = c.projet as {
      id: string;
      ref: string | null;
      client_id: string;
      taux_commission: number;
    } | null;
    if (!projet || projet.client_id !== clientId) continue;

    const tauxCommission = projet.taux_commission ?? 10;

    const opco = opcoForMonth(
      c.date_debut,
      c.duree_mois,
      c.npec_amount,
      monthKey,
    );
    const soluvia = soluviaForMonth(
      c.date_debut,
      c.duree_mois,
      c.npec_amount,
      tauxCommission,
      monthKey,
    );
    if (opco <= 0 && soluvia <= 0) continue;

    const entry = projetMap.get(projet.id) ?? {
      projetRef: projet.ref ?? '',
      production: 0,
      productionSoluvia: 0,
      facture: 0,
      encaisse: 0,
      enRetard: 0,
      commissions: [],
      nbContrats: 0,
    };
    entry.production += opco;
    entry.productionSoluvia += soluvia;
    entry.nbContrats += 1;
    if (projet.taux_commission != null) {
      entry.commissions.push(projet.taux_commission);
    }
    projetMap.set(projet.id, entry);
  }

  for (const f of factures ?? []) {
    const projet = f.projet as {
      id: string;
      ref: string | null;
      client_id: string;
    } | null;
    if (!projet || projet.client_id !== clientId) continue;

    const entry = projetMap.get(projet.id) ?? {
      projetRef: projet.ref ?? '',
      production: 0,
      productionSoluvia: 0,
      facture: 0,
      encaisse: 0,
      enRetard: 0,
      commissions: [],
      nbContrats: 0,
    };
    entry.facture += f.montant_ht;
    if (f.statut === 'en_retard') entry.enRetard += f.montant_ht;
    projetMap.set(projet.id, entry);
  }

  for (const p of paiements ?? []) {
    const facture = p.facture as {
      mois_concerne: string | null;
      montant_ht: number;
      montant_ttc: number;
      projet_id: string;
    } | null;
    if (!facture?.mois_concerne) continue;
    const entry = projetMap.get(facture.projet_id);
    if (entry)
      entry.encaisse += encaisseHt(
        p.montant,
        facture.montant_ht,
        facture.montant_ttc,
      );
  }

  return Array.from(projetMap.entries()).map(([projetId, data]) => {
    const ratio =
      data.production > 0 ? data.productionSoluvia / data.production : 0;
    return {
      projetId,
      projetRef: data.projetRef,
      production: round2(data.production),
      productionSoluvia: round2(data.productionSoluvia),
      facture: round2(data.facture),
      factureSoluvia: round2(data.facture * ratio),
      encaisse: round2(data.encaisse),
      encaisseSoluvia: round2(data.encaisse * ratio),
      enRetard: round2(data.enRetard),
      enRetardSoluvia: round2(data.enRetard * ratio),
      commission:
        data.commissions.length > 0
          ? round2(
              data.commissions.reduce((a, b) => a + b, 0) /
                data.commissions.length,
            )
          : 0,
      nbContrats: data.nbContrats,
    };
  });
}
