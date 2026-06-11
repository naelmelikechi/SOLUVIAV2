import type {
  ProjetBillableEvents,
  BillableEvent,
} from '@/lib/queries/billable-events';
import { resolveTvaRegime } from '@/lib/utils/tva-intracom';
import { isContratActif } from '@/lib/utils/contrat-states';

// ---------------------------------------------------------------------------
// Reste à facturer : agrégation pure (sans DB, sans React) des billable
// events + du potentiel contractuel, par contrat / projet / OPCO / total.
//
// Quatre natures de "reste" :
//   - facturable : events 'available' (bordereau OPCO PAYÉ côté Eduvia, pas
//                  encore facturé côté SOLUVIA). Actionnable immédiatement.
//   - bloqué     : events 'locked' (IDCC manquant, OPCO inconnu, line_type
//                  inconnu, exclusion engagement/opco). CA récupérable en
//                  corrigeant la donnée.
//   - en attente : PEDAGOGIE émise mais NON encore payée par l'OPCO (steps
//                  TRANSMIS). Quasi-certain (bordereau parti, virement à
//                  venir) mais non facturable tant que non encaissé.
//   - prévisionnel : estimation = base commissionnable contractuelle
//                  (`support` × taux = pédago seul) MOINS tout ce qui est déjà
//                  émis (facturable + bloqué + déjà facturé + en attente) = les
//                  steps pédago NON ENCORE ÉMIS. `support` exclut le matériel /
//                  RQTH (non commissionnés, mais inclus dans le NPEC) ; fallback
//                  NPEC si support absent. Contrats en état actif uniquement.
//
// Unité d'affichage : HT, pour réconcilier avec factures.montant_ht et les
// KPIs dashboard/production. montant_commissionne étant TTC (convention HEOL),
// on dérive le HT via le régime TVA du client (20 % domestique / 0 % intracom).
// ---------------------------------------------------------------------------

export type RafLockReason = NonNullable<BillableEvent['lock_reason']>;

export interface RafContratRow {
  projetId: string;
  projetRef: string;
  client: string;
  contratId: string;
  contratRef: string | null;
  contractNumber: string | null; // DECA OPCO
  apprenant: string;
  formationTitre: string | null;
  opcoCode: string | null;
  opcoNom: string | null;
  contractState: string;
  facturableHt: number;
  facturableTtc: number;
  bloqueHt: number;
  dejaFactureHt: number;
  previsionnelHt: number;
  emisNonPayeHt: number; // émis (TRANSMIS) mais pas encore payé par l'OPCO
  potentielHt: number; // npec × taux / 100, en HT
  nbFacturable: number; // nb events 'available'
  nbBloque: number; // nb events 'locked'
  lockReasons: RafLockReason[];
}

export interface RafProjetRow {
  projetId: string;
  projetRef: string;
  client: string;
  facturableHt: number;
  bloqueHt: number;
  dejaFactureHt: number;
  previsionnelHt: number;
  emisNonPayeHt: number;
  nbContrats: number; // contrats avec facturable | bloqué | prévisionnel > 0
  nbContratsFacturable: number;
  nbContratsBloque: number;
}

export interface RafOpcoRow {
  opcoCode: string | null;
  opcoNom: string; // "Non résolu" si opco non identifié
  facturableHt: number;
  bloqueHt: number;
  previsionnelHt: number;
  emisNonPayeHt: number;
  nbContratsFacturable: number;
}

export interface RafTotals {
  facturableHt: number;
  facturableTtc: number;
  bloqueHt: number;
  dejaFactureHt: number;
  previsionnelHt: number;
  emisNonPayeHt: number;
  nbContratsEnAttente: number;
  nbProjetsFacturable: number;
  nbContratsFacturable: number;
  nbContratsBloque: number;
}

export interface ResteAFacturer {
  totals: RafTotals;
  parProjet: RafProjetRow[];
  parContrat: RafContratRow[];
  parOpco: RafOpcoRow[];
}

const OPCO_NON_RESOLU = 'Non résolu';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface ContratAgg {
  facturableTtc: number;
  bloqueTtc: number;
  dejaTtc: number;
  nbFacturable: number;
  nbBloque: number;
  lockReasons: Set<RafLockReason>;
}

/**
 * Construit la vue "reste à facturer" agrégée à partir des billable events
 * de tous les projets facturables. Fonction pure : déterministe, testable,
 * aucun accès DB.
 */
export function buildResteAFacturer(
  projets: ProjetBillableEvents[],
): ResteAFacturer {
  const parContrat: RafContratRow[] = [];

  for (const p of projets) {
    const taux = p.tauxCommission;
    // taux TVA en pourcentage (20 | 0). montant_commissionne étant TTC, le HT
    // = TTC / (1 + tva/100), cohérent avec computeFactureTotauxTtcInclus.
    const tvaPct = resolveTvaRegime(p.clientTvaIntracom).taux;
    const div = 1 + tvaPct / 100;
    const toHt = (ttc: number): number => round2(ttc / div);

    const byContrat = new Map<string, ContratAgg>();
    for (const e of p.events) {
      let agg = byContrat.get(e.contrat_id);
      if (!agg) {
        agg = {
          facturableTtc: 0,
          bloqueTtc: 0,
          dejaTtc: 0,
          nbFacturable: 0,
          nbBloque: 0,
          lockReasons: new Set(),
        };
        byContrat.set(e.contrat_id, agg);
      }
      if (e.status === 'available') {
        agg.facturableTtc += e.montant_commissionne;
        agg.nbFacturable += 1;
      } else if (e.status === 'locked') {
        agg.bloqueTtc += e.montant_commissionne;
        agg.nbBloque += 1;
        if (e.lock_reason) agg.lockReasons.add(e.lock_reason);
      } else {
        // 'billed'
        agg.dejaTtc += e.montant_commissionne;
      }
    }

    for (const c of p.contrats) {
      const agg = byContrat.get(c.contrat_id);
      const facturableTtc = agg?.facturableTtc ?? 0;
      const bloqueTtc = agg?.bloqueTtc ?? 0;
      const dejaTtc = agg?.dejaTtc ?? 0;
      const emisNonPayeTtc = (c.pedago_emis_non_paye * taux) / 100;
      const emisTtc = facturableTtc + bloqueTtc + dejaTtc + emisNonPayeTtc;
      // potentielHt = plafond théorique sur le NPEC contractuel total.
      const potentielTtc = (c.npec_amount * taux) / 100;
      // Prévisionnel = reste commissionnable réel. La commission ne porte que
      // sur le pédago (`support`), pas sur le matériel/RQTH inclus dans le NPEC.
      // Fallback npec quand support non synchronisé (= ancienne borne haute).
      const commissionnableTtc = ((c.support ?? c.npec_amount) * taux) / 100;
      const previsionnelTtc = isContratActif(c.contract_state)
        ? Math.max(0, commissionnableTtc - emisTtc)
        : 0;

      parContrat.push({
        projetId: p.projetId,
        projetRef: p.projetRef,
        client: p.clientRaisonSociale,
        contratId: c.contrat_id,
        contratRef: c.contrat_ref,
        contractNumber: c.contract_number,
        apprenant: `${c.apprenant_prenom} ${c.apprenant_nom}`.trim(),
        formationTitre: c.formation_titre,
        opcoCode: c.opco_code,
        opcoNom: c.opco_nom,
        contractState: c.contract_state,
        facturableHt: toHt(facturableTtc),
        facturableTtc: round2(facturableTtc),
        bloqueHt: toHt(bloqueTtc),
        dejaFactureHt: toHt(dejaTtc),
        previsionnelHt: toHt(previsionnelTtc),
        emisNonPayeHt: toHt(emisNonPayeTtc),
        potentielHt: toHt(potentielTtc),
        nbFacturable: agg?.nbFacturable ?? 0,
        nbBloque: agg?.nbBloque ?? 0,
        lockReasons: agg ? Array.from(agg.lockReasons).sort() : [],
      });
    }
  }

  return {
    totals: buildTotals(parContrat),
    parProjet: buildParProjet(parContrat),
    parContrat: sortContrats(parContrat),
    parOpco: buildParOpco(parContrat),
  };
}

function buildTotals(rows: RafContratRow[]): RafTotals {
  const projetsFacturable = new Set<string>();
  let facturableHt = 0;
  let facturableTtc = 0;
  let bloqueHt = 0;
  let dejaFactureHt = 0;
  let previsionnelHt = 0;
  let emisNonPayeHt = 0;
  let nbContratsEnAttente = 0;
  let nbContratsFacturable = 0;
  let nbContratsBloque = 0;

  for (const r of rows) {
    facturableHt += r.facturableHt;
    facturableTtc += r.facturableTtc;
    bloqueHt += r.bloqueHt;
    dejaFactureHt += r.dejaFactureHt;
    previsionnelHt += r.previsionnelHt;
    emisNonPayeHt += r.emisNonPayeHt;
    if (r.emisNonPayeHt > 0) nbContratsEnAttente += 1;
    if (r.facturableHt > 0) {
      nbContratsFacturable += 1;
      projetsFacturable.add(r.projetId);
    }
    if (r.bloqueHt > 0) nbContratsBloque += 1;
  }

  return {
    facturableHt: round2(facturableHt),
    facturableTtc: round2(facturableTtc),
    bloqueHt: round2(bloqueHt),
    dejaFactureHt: round2(dejaFactureHt),
    previsionnelHt: round2(previsionnelHt),
    emisNonPayeHt: round2(emisNonPayeHt),
    nbContratsEnAttente,
    nbProjetsFacturable: projetsFacturable.size,
    nbContratsFacturable,
    nbContratsBloque,
  };
}

function buildParProjet(rows: RafContratRow[]): RafProjetRow[] {
  const map = new Map<string, RafProjetRow>();
  for (const r of rows) {
    let row = map.get(r.projetId);
    if (!row) {
      row = {
        projetId: r.projetId,
        projetRef: r.projetRef,
        client: r.client,
        facturableHt: 0,
        bloqueHt: 0,
        dejaFactureHt: 0,
        previsionnelHt: 0,
        emisNonPayeHt: 0,
        nbContrats: 0,
        nbContratsFacturable: 0,
        nbContratsBloque: 0,
      };
      map.set(r.projetId, row);
    }
    row.facturableHt = round2(row.facturableHt + r.facturableHt);
    row.bloqueHt = round2(row.bloqueHt + r.bloqueHt);
    row.dejaFactureHt = round2(row.dejaFactureHt + r.dejaFactureHt);
    row.previsionnelHt = round2(row.previsionnelHt + r.previsionnelHt);
    row.emisNonPayeHt = round2(row.emisNonPayeHt + r.emisNonPayeHt);
    if (r.facturableHt > 0) row.nbContratsFacturable += 1;
    if (r.bloqueHt > 0) row.nbContratsBloque += 1;
    if (
      r.facturableHt > 0 ||
      r.bloqueHt > 0 ||
      r.previsionnelHt > 0 ||
      r.emisNonPayeHt > 0
    )
      row.nbContrats += 1;
  }
  return Array.from(map.values()).sort(
    (a, b) =>
      b.facturableHt - a.facturableHt ||
      b.bloqueHt - a.bloqueHt ||
      b.previsionnelHt - a.previsionnelHt ||
      a.projetRef.localeCompare(b.projetRef),
  );
}

function buildParOpco(rows: RafContratRow[]): RafOpcoRow[] {
  const map = new Map<string, RafOpcoRow>();
  for (const r of rows) {
    if (
      r.facturableHt <= 0 &&
      r.bloqueHt <= 0 &&
      r.previsionnelHt <= 0 &&
      r.emisNonPayeHt <= 0
    )
      continue;
    const key = r.opcoCode ?? OPCO_NON_RESOLU;
    let row = map.get(key);
    if (!row) {
      row = {
        opcoCode: r.opcoCode,
        opcoNom: r.opcoNom ?? OPCO_NON_RESOLU,
        facturableHt: 0,
        bloqueHt: 0,
        previsionnelHt: 0,
        emisNonPayeHt: 0,
        nbContratsFacturable: 0,
      };
      map.set(key, row);
    }
    row.facturableHt = round2(row.facturableHt + r.facturableHt);
    row.bloqueHt = round2(row.bloqueHt + r.bloqueHt);
    row.previsionnelHt = round2(row.previsionnelHt + r.previsionnelHt);
    row.emisNonPayeHt = round2(row.emisNonPayeHt + r.emisNonPayeHt);
    if (r.facturableHt > 0) row.nbContratsFacturable += 1;
  }
  return Array.from(map.values()).sort(
    (a, b) =>
      b.facturableHt - a.facturableHt ||
      b.bloqueHt - a.bloqueHt ||
      b.previsionnelHt - a.previsionnelHt ||
      a.opcoNom.localeCompare(b.opcoNom),
  );
}

function sortContrats(rows: RafContratRow[]): RafContratRow[] {
  return [...rows].sort(
    (a, b) =>
      b.facturableHt - a.facturableHt ||
      b.bloqueHt - a.bloqueHt ||
      b.previsionnelHt - a.previsionnelHt ||
      (a.contractNumber ?? a.contratRef ?? '').localeCompare(
        b.contractNumber ?? b.contratRef ?? '',
      ),
  );
}
