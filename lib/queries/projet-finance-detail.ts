/**
 * Detail financier d'un projet sur ses DEUX flux : la commission que SOLUVIA
 * facture au client, et le financement que le CFA facture a l'OPCO dans
 * Eduvia. Ni les memes montants, ni les memes echeances, ni le meme
 * interlocuteur - voir lib/projets/finance-flux.ts.
 *
 * Reutilise des moteurs deja ecrits et testes, ne les recopie pas :
 * - agregerFluxOpco (lib/projets/finance-flux.ts) pour le flux OPCO entier ;
 * - computeContractSchedule (lib/queries/production.ts) pour le produit par
 *   contrat des deux flux (OPCO et commission) ;
 * - productionSoluviaHt (lib/utils/montant-ht.ts) pour convertir le produit
 *   OPCO d'un contrat en produit commission ;
 * - computeEcheancierDues, via getEcheancierDues (lib/queries/echeancier-dues.ts),
 *   pour le retard de facturation commission au modele echeancier.
 *
 * Retard de facturation au modele engagement : ce fichier NE reutilise PAS
 * selectContratsAFacturer (lib/queries/contrats-a-facturer.ts). Cette
 * fonction materialise une ligne par contrat - la seule echeance la plus en
 * retard -, ce qui est le bon comportement pour l'ecran /a-facturer (un
 * ecran de pilotage : "quel contrat dois-je traiter"), mais sous-evalue un
 * MONTANT : un contrat avec deux echeances ouvertes non transmises n'en
 * compterait qu'une. sommeRetardFacturationEngagement (plus bas) reproduit
 * le meme filtre d'eligibilite (isContratEligible cote
 * contrats-a-facturer.ts, fonction interne non exportee, non modifiee ici)
 * mais somme TOUTES les echeances dues. Consequence : ce montant peut
 * differer de la somme des montants affiches sur /a-facturer - les deux
 * ecrans repondent a des questions differentes (un contrat a traiter vs un
 * montant total du).
 *
 * Le retard de facturation n'est PAS le reste a facturer : il ne compte que
 * ce qui aurait deja du partir (jalon OPCO ouvert et non transmis, ou
 * echeance commission exigible et non facturee), jamais ce qui n'est pas
 * encore exigible.
 */

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { toLocalISODate, diffDaysIso } from '@/lib/utils/dates';
import { round2 } from '@/lib/utils/number';
import { productionSoluviaHt } from '@/lib/utils/montant-ht';
import { formatCurrency } from '@/lib/utils/formatters';
import { getProjetFinance } from '@/lib/queries/projets';
import { getDelaiReglementOpcoJours } from '@/lib/queries/parametres';
import { computeContractSchedule } from '@/lib/queries/production';
import { agregerFluxOpco, type JalonOpco } from '@/lib/projets/finance-flux';
import {
  getEcheancierDues,
  currentMoisCutoff,
} from '@/lib/queries/echeancier-dues';

export interface LigneFinance {
  id: string;
  /** Contrat / echeance concerne, deja mis en forme pour l'affichage. */
  label: string;
  /** Contexte court (date, delai...). Jamais un paragraphe. */
  detail: string;
  montant: number;
}

export interface FluxDetail {
  produit: number;
  facture: number;
  retardFacturation: number;
  retardEncaissement: number;
  lignesProduit: LigneFinance[];
  lignesFacture: LigneFinance[];
  lignesRetardFacturation: LigneFinance[];
  lignesRetardEncaissement: LigneFinance[];
}

export interface ProjetFinanceDetail {
  projetRef: string;
  /** Delai (jours) au-dela duquel un jalon OPCO transmis et non regle est en
   *  retard d'encaissement. Expose ici pour que la page n'ait pas a le
   *  redemander pour le seul besoin d'afficher le libelle du seuil. */
  delaiReglementOpcoJours: number;
  commission: FluxDetail;
  opco: FluxDetail;
}

function contratLabel(c: {
  ref: string | null;
  contract_number?: string | null;
  contractNumber?: string | null;
  apprenant_prenom?: string | null;
  apprenant_nom?: string | null;
  apprenti?: string;
}): string {
  const ref = c.ref ?? c.contract_number ?? c.contractNumber ?? '';
  const apprenant =
    c.apprenti ?? `${c.apprenant_prenom ?? ''} ${c.apprenant_nom ?? ''}`.trim();
  return apprenant ? `${ref} - ${apprenant}` : ref || 'Contrat';
}

// ---------------------------------------------------------------------------
// Retard de facturation, modele engagement (correction du sous-comptage)
// ---------------------------------------------------------------------------

/**
 * Contrat eligible a une echeance OPCO facturable : MEME regle que la
 * fonction interne isContratEligible de contrats-a-facturer.ts (non
 * exportee la-bas, non modifiee ici). Dupliquee volontairement : ce fichier
 * a besoin d'un noyau qui somme au lieu de ne garder que l'echeance la plus
 * en retard (cf. en-tete du fichier).
 */
function isContratEligibleFacturationEngagement(c: {
  archive: boolean;
  facturation_verrouillee: boolean;
  contract_state: string;
}): boolean {
  return (
    !c.archive &&
    !c.facturation_verrouillee &&
    (c.contract_state === 'ENGAGE' || c.contract_state === 'TRANSMIS')
  );
}

export interface RetardFacturationEngagementResult {
  montant: number;
  lignes: LigneFinance[];
}

/**
 * Retard de facturation commission au modele engagement : somme TOUTES les
 * echeances OPCO ouvertes (opening_date <= today) et non transmises
 * (invoice_state null) des contrats eligibles - pas seulement l'echeance la
 * plus en retard par contrat. Un contrat avec deux echeances ouvertes non
 * transmises pese deux fois dans le montant retourne.
 */
export function sommeRetardFacturationEngagement(input: {
  contrats: Array<{
    id: string;
    ref: string | null;
    contract_number: string | null;
    apprenant_prenom: string | null;
    apprenant_nom: string | null;
    archive: boolean;
    facturation_verrouillee: boolean;
    contract_state: string;
  }>;
  steps: Array<{
    contrat_id: string;
    step_number: number;
    opening_date: string | null;
    invoice_state: string | null;
    total_amount: number | null;
  }>;
  today: string;
}): RetardFacturationEngagementResult {
  const { contrats, steps, today } = input;
  const eligibles = new Map(
    contrats
      .filter(isContratEligibleFacturationEngagement)
      .map((c) => [c.id, c] as const),
  );

  interface Due {
    contratId: string;
    stepNumber: number;
    openingDate: string;
    montant: number;
  }
  const dues: Due[] = [];
  let montant = 0;
  for (const s of steps) {
    if (s.invoice_state !== null) continue;
    if (!s.opening_date || s.opening_date > today) continue;
    if (!eligibles.has(s.contrat_id)) continue;
    const m = s.total_amount ?? 0;
    montant += m;
    dues.push({
      contratId: s.contrat_id,
      stepNumber: s.step_number,
      openingDate: s.opening_date,
      montant: m,
    });
  }

  // Plus en retard d'abord, meme convention de tri que selectContratsAFacturer.
  dues.sort(
    (a, b) =>
      a.openingDate.localeCompare(b.openingDate) ||
      a.contratId.localeCompare(b.contratId),
  );

  const lignes: LigneFinance[] = dues.map((d) => ({
    id: `${d.contratId}-${d.stepNumber}`,
    label: contratLabel(eligibles.get(d.contratId)!),
    detail: `Echeance ${d.stepNumber} ouverte le ${d.openingDate} (${Math.max(0, diffDaysIso(d.openingDate, today))} j)`,
    montant: d.montant,
  }));

  return { montant: round2(montant), lignes };
}

// ---------------------------------------------------------------------------
// Produit (decompte ligne a ligne des deux flux)
// ---------------------------------------------------------------------------

/**
 * Produit OPCO d'un contrat (prorata rupture inclus) : somme du volet OPCO
 * de computeContractSchedule (lib/queries/production.ts). 0 si le contrat
 * n'a pas les donnees necessaires (NPEC, date de debut, duree) - le taux de
 * commission est sans effet sur ce volet, computeContractSchedule l'ignore
 * pour la jambe OPCO du calendrier.
 */
function montantProduitOpcoContrat(c: {
  npec_amount: number | null;
  date_debut: string | null;
  duree_mois: number | null;
  date_rupture: string | null;
}): number {
  const npec = c.npec_amount ?? 0;
  if (npec <= 0 || !c.date_debut || !c.duree_mois || c.duree_mois <= 0)
    return 0;
  const schedule = computeContractSchedule(
    c.date_debut,
    c.duree_mois,
    npec,
    0,
    c.date_rupture,
  );
  return round2(schedule.opco.reduce((sum, e) => sum + e.amount, 0));
}

export interface LignesProduitResult {
  opco: LigneFinance[];
  commission: LigneFinance[];
}

/**
 * Decompte ligne a ligne du "Produit" des deux flux, une ligne par contrat
 * non archive. Le produit commission d'un contrat reutilise le produit OPCO
 * du meme contrat via productionSoluviaHt (lib/utils/montant-ht.ts), meme
 * formule que la carte de synthese et l'agregat commission.produit.
 */
export function construireLignesProduit(
  contrats: Array<{
    id: string;
    ref: string | null;
    contract_number: string | null;
    apprenant_prenom: string | null;
    apprenant_nom: string | null;
    formation_titre: string | null;
    archive: boolean;
    npec_amount: number | null;
    date_debut: string | null;
    duree_mois: number | null;
    date_rupture: string | null;
  }>,
  tauxCommission: number,
): LignesProduitResult {
  const opco: LigneFinance[] = [];
  const commission: LigneFinance[] = [];
  for (const c of contrats) {
    if (c.archive) continue;
    const montantOpco = montantProduitOpcoContrat(c);
    const label = contratLabel(c);
    const detail = `${c.formation_titre ?? 'Formation non renseignee'} - NPEC ${formatCurrency(c.npec_amount ?? 0)}`;
    opco.push({ id: c.id, label, detail, montant: montantOpco });
    commission.push({
      id: c.id,
      label,
      detail: `${detail}, commission ${tauxCommission}%`,
      montant: productionSoluviaHt(montantOpco, tauxCommission),
    });
  }
  return { opco, commission };
}

// ---------------------------------------------------------------------------
// Facture (decompte ligne a ligne des deux flux)
// ---------------------------------------------------------------------------

/** Une ligne par jalon transmis (invoice_state non nul) des contrats non
 *  archives - meme jeu de jalons que fluxOpcoAgg.facture. */
export function construireLignesFactureOpco(
  jalons: JalonOpco[],
  contratById: Map<
    string,
    {
      ref: string | null;
      contract_number?: string | null;
      apprenant_prenom?: string | null;
      apprenant_nom?: string | null;
    }
  >,
): LigneFinance[] {
  return jalons
    .filter((j) => j.invoiceState != null)
    .map((j) => ({
      id: j.id,
      label: contratLabel(contratById.get(j.contratId) ?? { ref: null }),
      detail: `Etape ${j.stepNumber}, transmise le ${
        j.invoiceSentAt ? j.invoiceSentAt.slice(0, 10) : 'date inconnue'
      } - ${j.invoiceState}`,
      montant: j.totalAmount,
    }));
}

export interface FactureCommissionRow {
  id: string;
  ref: string | null;
  montant_ht: number | null;
  date_emission: string | null;
  date_echeance: string | null;
  statut: string;
}

/** Une ligne par facture du projet (avoirs inclus, montant tel que stocke -
 *  deja negatif pour un avoir, jamais re-negative ici). */
export function construireLignesFactureCommission(
  factures: FactureCommissionRow[],
): LigneFinance[] {
  return factures.map((f) => ({
    id: f.id,
    label: f.ref ?? f.id,
    detail: `Emise le ${f.date_emission ?? '?'}, echeance le ${f.date_echeance ?? '?'} - ${f.statut}`,
    montant: f.montant_ht ?? 0,
  }));
}

export async function getProjetFinanceDetail(
  projetId: string,
  projetRef: string,
): Promise<ProjetFinanceDetail> {
  const supabase = await createClient();
  const today = toLocalISODate(new Date());

  const [
    finance,
    delaiReglementOpcoJours,
    projetRes,
    contratsRes,
    facturesRetardRes,
    facturesCommissionRes,
  ] = await Promise.all([
    getProjetFinance(projetId),
    getDelaiReglementOpcoJours(),
    supabase
      .from('projets')
      .select('modele_facturation')
      .eq('id', projetId)
      .single(),
    supabase
      .from('contrats')
      .select(
        'id, ref, contract_number, apprenant_prenom, apprenant_nom, formation_titre, contract_state, archive, facturation_verrouillee, npec_amount, date_debut, duree_mois, date_rupture',
      )
      .eq('projet_id', projetId),
    // Retard d'encaissement commission : factures echues, ni payees ni
    // avoirs ni brouillons (definition du plan, distincte du "Facture" qui
    // inclut aussi payee/avoir).
    supabase
      .from('factures')
      .select('id, ref, montant_ht, date_echeance, statut')
      .eq('projet_id', projetId)
      .in('statut', ['emise', 'en_retard'])
      .lt('date_echeance', today),
    // Decompte ligne a ligne du "Facture" commission : MEME jeu de statuts
    // que facture_soluvia (getProjetFinance), pour que la somme des lignes
    // egale le total affiche dans le bandeau.
    supabase
      .from('factures')
      .select('id, ref, montant_ht, date_emission, date_echeance, statut')
      .eq('projet_id', projetId)
      .in('statut', ['emise', 'payee', 'en_retard', 'avoir']),
  ]);

  if (projetRes.error) {
    logger.error('queries.projet-finance-detail', 'projet fetch failed', {
      projetId,
      error: projetRes.error,
    });
  }
  if (contratsRes.error) {
    logger.error('queries.projet-finance-detail', 'contrats fetch failed', {
      projetId,
      error: contratsRes.error,
    });
  }
  if (facturesRetardRes.error) {
    logger.error('queries.projet-finance-detail', 'factures fetch failed', {
      projetId,
      error: facturesRetardRes.error,
    });
  }
  if (facturesCommissionRes.error) {
    logger.error(
      'queries.projet-finance-detail',
      'factures commission fetch failed',
      { projetId, error: facturesCommissionRes.error },
    );
  }

  const contrats = contratsRes.data ?? [];
  const contratIds = contrats.map((c) => c.id);
  const nonArchivedContratIds = new Set(
    contrats.filter((c) => !c.archive).map((c) => c.id),
  );

  const stepsRes =
    contratIds.length > 0
      ? await supabase
          .from('eduvia_invoice_steps')
          .select(
            'id, contrat_id, step_number, opening_date, invoice_state, total_amount, paid_amount, opco_settled_amount, invoice_sent_at',
          )
          .in('contrat_id', contratIds)
      : { data: [], error: null };
  if (stepsRes.error) {
    logger.error('queries.projet-finance-detail', 'steps fetch failed', {
      projetId,
      error: stepsRes.error,
    });
  }
  const steps = stepsRes.data ?? [];

  // ---------------------------------------------------------------------
  // Flux OPCO : jalons des contrats NON archives uniquement (le produit
  // OPCO - finance.production_opco - obeit deja a la meme regle).
  // ---------------------------------------------------------------------
  const jalonsOpco: JalonOpco[] = steps
    .filter((s) => nonArchivedContratIds.has(s.contrat_id))
    .map((s) => ({
      id: s.id,
      contratId: s.contrat_id,
      stepNumber: s.step_number,
      openingDate: s.opening_date,
      invoiceState: s.invoice_state,
      totalAmount: s.total_amount ?? 0,
      paidAmount: s.paid_amount ?? 0,
      opcoSettledAmount: s.opco_settled_amount ?? 0,
      invoiceSentAt: s.invoice_sent_at,
    }));

  const contratById = new Map(contrats.map((c) => [c.id, c]));
  const fluxOpcoAgg = agregerFluxOpco(
    jalonsOpco,
    today,
    delaiReglementOpcoJours,
  );

  // Produit : une ligne par contrat non archive, les deux flux (OPCO puis
  // commission) partagent le meme calcul de base (computeContractSchedule).
  const lignesProduit = construireLignesProduit(
    contrats,
    finance.taux_commission,
  );

  const opco: FluxDetail = {
    produit: finance.production_opco,
    facture: fluxOpcoAgg.facture,
    retardFacturation: fluxOpcoAgg.retardFacturation,
    retardEncaissement: fluxOpcoAgg.retardEncaissement,
    lignesProduit: lignesProduit.opco,
    lignesFacture: construireLignesFactureOpco(jalonsOpco, contratById),
    lignesRetardFacturation: fluxOpcoAgg.lignesRetardFacturation.map((l) => ({
      id: l.id,
      label: contratLabel(contratById.get(l.contratId) ?? { ref: null }),
      detail: `Etape ${l.stepNumber}, ouverte le ${l.openingDate} (${l.joursDepuisOuverture} j)`,
      montant: l.montant,
    })),
    lignesRetardEncaissement: fluxOpcoAgg.lignesRetardEncaissement.map((l) => ({
      id: l.id,
      label: contratLabel(contratById.get(l.contratId) ?? { ref: null }),
      detail: `Etape ${l.stepNumber}, transmise le ${l.invoiceSentAt.slice(0, 10)} (${l.joursDepuisEnvoi} j)`,
      montant: l.montantDu,
    })),
  };

  // ---------------------------------------------------------------------
  // Flux commission
  // ---------------------------------------------------------------------
  const facturesRetard = facturesRetardRes.data ?? [];
  const retardEncaissementCommission = facturesRetard.reduce(
    (sum, f) => sum + (f.montant_ht ?? 0),
    0,
  );
  const lignesRetardEncaissementCommission: LigneFinance[] = facturesRetard.map(
    (f) => ({
      id: f.id,
      label: f.ref ?? f.id,
      detail: `Echeance depassee le ${f.date_echeance ?? ''}`,
      montant: f.montant_ht ?? 0,
    }),
  );

  const modeleFacturation =
    projetRes.data?.modele_facturation === 'engagement'
      ? 'engagement'
      : 'echeancier';

  let retardFacturationCommission = 0;
  let lignesRetardFacturationCommission: LigneFinance[] = [];

  if (modeleFacturation === 'engagement') {
    // sommeRetardFacturationEngagement (definie plus haut dans ce fichier)
    // reproduit le filtre d'eligibilite de contrats-a-facturer.ts mais somme
    // TOUTES les echeances dues, pas seulement la plus en retard par contrat
    // (cf. en-tete du fichier pour la justification de cet ecart volontaire
    // avec /a-facturer).
    const { montant, lignes } = sommeRetardFacturationEngagement({
      contrats,
      steps,
      today,
    });
    retardFacturationCommission = montant;
    lignesRetardFacturationCommission = lignes;
  } else {
    // Modele echeancier : computeEcheancierDues (via getEcheancierDues, qui
    // assemble deja projet/contrats/templates/deja-facture) donne les mois
    // dus jusqu'au mois courant INCLUS. Le retard ne compte que ce qui
    // aurait deja du partir, donc on exclut le mois courant : un jalon du
    // mois en cours n'est pas encore en retard.
    const { dues } = await getEcheancierDues(projetId);
    const cutoff = currentMoisCutoff();
    const duesEnRetard = dues.filter((d) => d.moisConcerne < cutoff);
    retardFacturationCommission = round2(
      duesEnRetard.reduce((sum, d) => sum + d.montantHt, 0),
    );
    lignesRetardFacturationCommission = duesEnRetard.flatMap((d) =>
      d.contributions.map((c) => ({
        id: `${c.contratId}-${c.moisRelatif}`,
        label: contratLabel({
          ref: c.contratRef,
          contract_number: c.contractNumber,
          apprenti: c.apprenant,
        }),
        detail: `Mois ${d.moisConcerne.slice(0, 7)} (M+${c.moisRelatif})`,
        montant: c.montantHt,
      })),
    );
  }

  const commission: FluxDetail = {
    produit: productionSoluviaHt(
      finance.production_opco,
      finance.taux_commission,
    ),
    facture: finance.facture_soluvia,
    retardFacturation: retardFacturationCommission,
    retardEncaissement: round2(retardEncaissementCommission),
    lignesProduit: lignesProduit.commission,
    lignesFacture: construireLignesFactureCommission(
      facturesCommissionRes.data ?? [],
    ),
    lignesRetardFacturation: lignesRetardFacturationCommission,
    lignesRetardEncaissement: lignesRetardEncaissementCommission,
  };

  return {
    projetRef,
    delaiReglementOpcoJours,
    commission,
    opco,
  };
}
