import { computeContractSchedule } from '@/lib/queries/production';
import { encaisseHt } from '@/lib/utils/montant-ht';
import { round2 } from '@/lib/utils/number';
import { resolveTauxCommission } from '@/lib/utils/commission';

// -----------------------------------------------------------------------------
// Agregation pure du drill-down production (mois -> clients -> projets).
//
// Extrait de lib/actions/production.ts pour deux raisons :
// - un fichier 'use server' ne peut exporter que des fonctions async, donc la
//   logique pure y etait intestable ;
// - fetchProductionByClient et fetchProductionByProjet dupliquaient ~90% du
//   code (queries + boucles d'agregation), avec des divergences deja
//   observees. Ici : une seule agregation par projet, deux projections.
// -----------------------------------------------------------------------------

export interface ProductionByClientRow {
  clientId: string;
  clientName: string;
  production: number;
  productionSoluvia: number;
  facture: number;
  encaisse: number;
  enRetard: number;
  // Equivalents TTC (montant_ttc factures = valeurs PDF, paiements bruts).
  factureTtc: number;
  encaisseTtc: number;
  enRetardTtc: number;
  nbProjets: number;
}

export interface ProductionByProjetRow {
  projetId: string;
  projetRef: string;
  production: number;
  productionSoluvia: number;
  facture: number;
  encaisse: number;
  enRetard: number;
  // Equivalents TTC (montant_ttc factures = valeurs PDF, paiements bruts).
  factureTtc: number;
  encaisseTtc: number;
  enRetardTtc: number;
  commission: number;
  nbContrats: number;
}

export interface ProjetInfo {
  id: string;
  ref: string | null;
  client_id: string;
  taux_commission: number | null;
  client: { id: string; raison_sociale: string } | null;
}

export interface ContratInput {
  date_debut: string | null;
  duree_mois: number | null;
  npec_amount: number | null;
  projet: ProjetInfo | null;
}

export interface FactureInput {
  id: string;
  montant_ht: number;
  montant_ttc: number;
  statut: string;
  est_avoir: boolean;
  facture_origine_id: string | null;
  projet: ProjetInfo | null;
}

export interface PaiementInput {
  montant: number;
  facture: {
    montant_ht: number;
    montant_ttc: number;
    projet_id: string;
  } | null;
}

interface ProjetAgg {
  projetRef: string;
  clientId: string;
  clientName: string;
  production: number;
  productionSoluvia: number;
  facture: number;
  encaisse: number;
  enRetard: number;
  // Equivalents TTC (montant_ttc factures = valeurs PDF, paiements bruts).
  factureTtc: number;
  encaisseTtc: number;
  enRetardTtc: number;
  commissions: number[];
  nbContrats: number;
}

/** Somme des entrees d'un schedule tombant dans monthKey (YYYY-MM). */
function scheduleAmountForMonth(
  entries: { month: string; amount: number }[],
  monthKey: string,
): number {
  let total = 0;
  for (const e of entries) {
    if (e.month === monthKey) total += e.amount;
  }
  return total;
}

/**
 * Agrege contrats (production theorique via computeContractSchedule),
 * factures et paiements d'un mois par projet. Source unique des deux niveaux
 * du drill-down : le rollup client et la projection projet en derivent.
 */
export function aggregateMonthByProjet(
  monthKey: string,
  contrats: ContratInput[],
  factures: FactureInput[],
  paiements: PaiementInput[],
): Map<string, ProjetAgg> {
  const projetMap = new Map<string, ProjetAgg>();

  function ensureProjet(projet: ProjetInfo): ProjetAgg {
    let entry = projetMap.get(projet.id);
    if (!entry) {
      entry = {
        projetRef: projet.ref ?? '',
        clientId: projet.client?.id ?? projet.client_id,
        clientName: projet.client?.raison_sociale ?? '',
        production: 0,
        productionSoluvia: 0,
        facture: 0,
        encaisse: 0,
        enRetard: 0,
        factureTtc: 0,
        encaisseTtc: 0,
        enRetardTtc: 0,
        commissions: [],
        nbContrats: 0,
      };
      projetMap.set(projet.id, entry);
    }
    return entry;
  }

  for (const c of contrats) {
    if (!c.date_debut || !c.duree_mois || c.duree_mois <= 0) continue;
    if (!c.npec_amount || c.npec_amount <= 0) continue;
    if (!c.projet) continue;

    const tauxCommission = resolveTauxCommission(c.projet.taux_commission);
    const schedule = computeContractSchedule(
      c.date_debut,
      c.duree_mois,
      c.npec_amount,
      tauxCommission,
    );
    const opco = scheduleAmountForMonth(schedule.opco, monthKey);
    const soluvia = scheduleAmountForMonth(schedule.soluvia, monthKey);
    if (opco <= 0 && soluvia <= 0) continue;

    const entry = ensureProjet(c.projet);
    entry.production += opco;
    entry.productionSoluvia += soluvia;
    entry.nbContrats += 1;
    if (c.projet.taux_commission != null) {
      entry.commissions.push(c.projet.taux_commission);
    }
  }

  // Avoirs emis indexes par facture d'origine : le "facture" du projet est
  // net (avoirs negatifs sommes tels quels), et le solde en retard d'une
  // facture deduit ses avoirs (soldee par avoir => plus en retard).
  const avoirByOrigine = new Map<string, { ht: number; ttc: number }>();
  for (const f of factures) {
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

  for (const f of factures) {
    if (!f.projet) continue;
    const entry = ensureProjet(f.projet);
    entry.facture += f.montant_ht;
    entry.factureTtc += f.montant_ttc ?? 0;
    if (f.statut === 'en_retard') {
      const av = avoirByOrigine.get(f.id);
      entry.enRetard += Math.max(0, f.montant_ht + (av?.ht ?? 0));
      entry.enRetardTtc += Math.max(0, (f.montant_ttc ?? 0) + (av?.ttc ?? 0));
    }
  }

  for (const p of paiements) {
    if (!p.facture) continue;
    const entry = projetMap.get(p.facture.projet_id);
    if (entry) {
      entry.encaisseTtc += p.montant ?? 0;
      entry.encaisse += encaisseHt(
        p.montant,
        p.facture.montant_ht,
        p.facture.montant_ttc,
      );
    }
  }

  return projetMap;
}

/**
 * Rollup par client : addition des agregats projet, sans aucun scaling - les
 * factures sont deja la commission SOLUVIA reelle.
 */
export function rollupByClient(
  projetMap: Map<string, ProjetAgg>,
): ProductionByClientRow[] {
  type ClientAgg = {
    clientName: string;
    production: number;
    productionSoluvia: number;
    facture: number;
    encaisse: number;
    enRetard: number;
    factureTtc: number;
    encaisseTtc: number;
    enRetardTtc: number;
    projetIds: Set<string>;
  };
  const clientMap = new Map<string, ClientAgg>();

  for (const [projetId, p] of projetMap) {
    let client = clientMap.get(p.clientId);
    if (!client) {
      client = {
        clientName: p.clientName,
        production: 0,
        productionSoluvia: 0,
        facture: 0,
        encaisse: 0,
        enRetard: 0,
        factureTtc: 0,
        encaisseTtc: 0,
        enRetardTtc: 0,
        projetIds: new Set<string>(),
      };
      clientMap.set(p.clientId, client);
    }
    client.production += p.production;
    client.productionSoluvia += p.productionSoluvia;
    client.facture += p.facture;
    client.encaisse += p.encaisse;
    client.enRetard += p.enRetard;
    client.factureTtc += p.factureTtc;
    client.encaisseTtc += p.encaisseTtc;
    client.enRetardTtc += p.enRetardTtc;
    client.projetIds.add(projetId);
  }

  return Array.from(clientMap.entries()).map(([clientId, data]) => ({
    clientId,
    clientName: data.clientName,
    production: round2(data.production),
    productionSoluvia: round2(data.productionSoluvia),
    facture: round2(data.facture),
    encaisse: round2(data.encaisse),
    enRetard: round2(data.enRetard),
    factureTtc: round2(data.factureTtc),
    encaisseTtc: round2(data.encaisseTtc),
    enRetardTtc: round2(data.enRetardTtc),
    nbProjets: data.projetIds.size,
  }));
}

/** Projection par projet du meme agregat (drill-down niveau 2). */
export function projectByProjet(
  projetMap: Map<string, ProjetAgg>,
): ProductionByProjetRow[] {
  return Array.from(projetMap.entries()).map(([projetId, data]) => ({
    projetId,
    projetRef: data.projetRef,
    production: round2(data.production),
    productionSoluvia: round2(data.productionSoluvia),
    facture: round2(data.facture),
    encaisse: round2(data.encaisse),
    enRetard: round2(data.enRetard),
    factureTtc: round2(data.factureTtc),
    encaisseTtc: round2(data.encaisseTtc),
    enRetardTtc: round2(data.enRetardTtc),
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

/**
 * Cle du mois suivant (YYYY-MM), calculee sur (annee, mois) uniquement.
 *
 * Sert de borne haute exclusive pour filtrer factures.mois_concerne, un TEXT
 * a formats mixtes ('YYYY-MM' event-based, 'YYYY-MM-01' ou 'YYYY-MM-01 - ...'
 * echeancier) : les bornes courtes [monthKey, nextMonthKey) sont correctes
 * lexicographiquement pour TOUS ces formats, contrairement a 'YYYY-MM-01'
 * qui exclut 'YYYY-MM' du mois vise ('2026-07' < '2026-07-01').
 */
export function nextMonthKey(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const total = year * 12 + (month - 1) + 1;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}
