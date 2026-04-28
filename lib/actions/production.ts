'use server';

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { computeContractSchedule } from '@/lib/queries/production';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProductionByClientRow {
  clientId: string;
  clientName: string;
  production: number;
  facture: number;
  encaisse: number;
  enRetard: number;
  nbProjets: number;
}

export interface ProductionByProjetRow {
  projetId: string;
  projetRef: string;
  production: number;
  facture: number;
  encaisse: number;
  enRetard: number;
  commission: number;
  nbContrats: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

// ---------------------------------------------------------------------------
// fetchProductionByClient - breakdown of a month by client
// ---------------------------------------------------------------------------

export async function fetchProductionByClient(
  mois: string,
): Promise<ProductionByClientRow[]> {
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
      projet:projets!factures_projet_id_fkey (
        id,
        client_id,
        client:clients!projets_client_id_fkey (
          id,
          raison_sociale
        )
      )
    `,
    )
    .gte('mois_concerne', monthStart)
    .lt('mois_concerne', monthEnd)
    .neq('statut', 'avoir');

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
      facture:factures!paiements_facture_id_fkey (
        mois_concerne,
        projet:projets!factures_projet_id_fkey (
          client_id
        )
      )
    `,
    )
    .gte('facture.mois_concerne', monthStart)
    .lt('facture.mois_concerne', monthEnd);

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
      projet:projets!contrats_projet_id_fkey (
        id,
        client_id,
        client:clients!projets_client_id_fkey (
          id,
          raison_sociale
        )
      )
    `,
    )
    .eq('archive', false);

  if (contratsError) {
    logger.error(
      'actions.production',
      'fetchProductionByClient failed (contrats)',
      { error: contratsError },
    );
  }

  const clientMap = new Map<
    string,
    {
      clientName: string;
      production: number;
      facture: number;
      encaisse: number;
      enRetard: number;
      projetIds: Set<string>;
    }
  >();

  // Production from contrats - new schedule (40/30/20/10)
  for (const c of contrats ?? []) {
    if (!c.date_debut || !c.duree_mois || c.duree_mois <= 0) continue;
    if (!c.npec_amount || c.npec_amount <= 0) continue;

    const projet = c.projet as {
      id: string;
      client_id: string;
      client: { id: string; raison_sociale: string } | null;
    } | null;
    if (!projet?.client) continue;

    const monthlyOpco = opcoForMonth(
      c.date_debut,
      c.duree_mois,
      c.npec_amount,
      monthKey,
    );
    if (monthlyOpco <= 0) continue;

    const entry = clientMap.get(projet.client.id) ?? {
      clientName: projet.client.raison_sociale,
      production: 0,
      facture: 0,
      encaisse: 0,
      enRetard: 0,
      projetIds: new Set<string>(),
    };
    entry.production += monthlyOpco;
    entry.projetIds.add(projet.id);
    clientMap.set(projet.client.id, entry);
  }

  for (const f of factures ?? []) {
    const projet = f.projet as {
      id: string;
      client_id: string;
      client: { id: string; raison_sociale: string } | null;
    } | null;
    if (!projet?.client) continue;

    const entry = clientMap.get(projet.client.id) ?? {
      clientName: projet.client.raison_sociale,
      production: 0,
      facture: 0,
      encaisse: 0,
      enRetard: 0,
      projetIds: new Set<string>(),
    };
    entry.facture += f.montant_ht;
    if (f.statut === 'en_retard') entry.enRetard += f.montant_ht;
    entry.projetIds.add(projet.id);
    clientMap.set(projet.client.id, entry);
  }

  for (const p of paiements ?? []) {
    const facture = p.facture as {
      mois_concerne: string | null;
      projet: { client_id: string } | null;
    } | null;
    if (!facture?.mois_concerne || !facture.projet) continue;
    const entry = clientMap.get(facture.projet.client_id);
    if (entry) entry.encaisse += p.montant;
  }

  return Array.from(clientMap.entries()).map(([clientId, data]) => ({
    clientId,
    clientName: data.clientName,
    production: round2(data.production),
    facture: round2(data.facture),
    encaisse: round2(data.encaisse),
    enRetard: round2(data.enRetard),
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
      projet:projets!factures_projet_id_fkey (
        id,
        ref,
        client_id
      )
    `,
    )
    .gte('mois_concerne', monthStart)
    .lt('mois_concerne', monthEnd)
    .neq('statut', 'avoir');

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
      facture:factures!paiements_facture_id_fkey (
        mois_concerne,
        projet_id
      )
    `,
    )
    .gte('facture.mois_concerne', monthStart)
    .lt('facture.mois_concerne', monthEnd);

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
      projet:projets!contrats_projet_id_fkey (
        id,
        ref,
        client_id,
        taux_commission
      )
    `,
    )
    .eq('archive', false);

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

    const monthlyOpco = opcoForMonth(
      c.date_debut,
      c.duree_mois,
      c.npec_amount,
      monthKey,
    );
    if (monthlyOpco <= 0) continue;

    const entry = projetMap.get(projet.id) ?? {
      projetRef: projet.ref ?? '',
      production: 0,
      facture: 0,
      encaisse: 0,
      enRetard: 0,
      commissions: [],
      nbContrats: 0,
    };
    entry.production += monthlyOpco;
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
      projet_id: string;
    } | null;
    if (!facture?.mois_concerne) continue;
    const entry = projetMap.get(facture.projet_id);
    if (entry) entry.encaisse += p.montant;
  }

  return Array.from(projetMap.entries()).map(([projetId, data]) => ({
    projetId,
    projetRef: data.projetRef,
    production: round2(data.production),
    facture: round2(data.facture),
    encaisse: round2(data.encaisse),
    enRetard: round2(data.enRetard),
    commission:
      data.commissions.length > 0
        ? round2(
            data.commissions.reduce((a, b) => a + b, 0) /
              data.commissions.length,
          )
        : 0,
    nbContrats: data.nbContrats,
  }));
}
