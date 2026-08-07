/**
 * Detail financier d'un projet sur ses DEUX flux : la commission que SOLUVIA
 * facture au client, et le financement que le CFA facture a l'OPCO dans
 * Eduvia. Ni les memes montants, ni les memes echeances, ni le meme
 * interlocuteur - voir lib/projets/finance-flux.ts.
 *
 * Reutilise trois moteurs deja ecrits et testes, ne les recopie pas :
 * - agregerFluxOpco (lib/projets/finance-flux.ts) pour le flux OPCO entier ;
 * - selectContratsAFacturer (lib/queries/contrats-a-facturer.ts) pour le
 *   retard de facturation commission au modele engagement ;
 * - computeEcheancierDues, via getEcheancierDues (lib/queries/echeancier-dues.ts),
 *   pour le retard de facturation commission au modele echeancier.
 *
 * Le retard de facturation n'est PAS le reste a facturer : il ne compte que
 * ce qui aurait deja du partir (jalon OPCO ouvert et non transmis, ou
 * echeance commission exigible et non facturee), jamais ce qui n'est pas
 * encore exigible.
 */

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { toLocalISODate } from '@/lib/utils/dates';
import { round2 } from '@/lib/utils/number';
import { productionSoluviaHt } from '@/lib/utils/montant-ht';
import { getProjetFinance } from '@/lib/queries/projets';
import { getDelaiReglementOpcoJours } from '@/lib/queries/parametres';
import { agregerFluxOpco, type JalonOpco } from '@/lib/projets/finance-flux';
import {
  selectContratsAFacturer,
  type AFacturerContratInput,
  type AFacturerStepInput,
} from '@/lib/queries/contrats-a-facturer';
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

  const opco: FluxDetail = {
    produit: finance.production_opco,
    facture: fluxOpcoAgg.facture,
    retardFacturation: fluxOpcoAgg.retardFacturation,
    retardEncaissement: fluxOpcoAgg.retardEncaissement,
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
    // Le meme jeu de contrats/steps sert d'entree au noyau pur
    // selectContratsAFacturer (deja teste, deja utilise par /a-facturer) :
    // pas de logique de retard recopiee ici, seulement l'assemblage des
    // entrees qu'il attend, restreintes a ce seul projet.
    const afacturerContrats: AFacturerContratInput[] = contrats.map((c) => ({
      id: c.id,
      ref: c.ref,
      contract_number: c.contract_number,
      apprenant_prenom: c.apprenant_prenom,
      apprenant_nom: c.apprenant_nom,
      formation_titre: c.formation_titre,
      contract_state: c.contract_state,
      archive: c.archive,
      facturation_verrouillee: c.facturation_verrouillee,
      projet_ref: projetRef,
      client_raison_sociale: null,
    }));
    const afacturerSteps: AFacturerStepInput[] = steps.map((s) => ({
      contrat_id: s.contrat_id,
      step_number: s.step_number,
      opening_date: s.opening_date,
      invoice_state: s.invoice_state,
      total_amount: s.total_amount,
    }));
    const rows = selectContratsAFacturer({
      contrats: afacturerContrats,
      steps: afacturerSteps,
      // Le code OPCO n'est utilise par le noyau que pour l'affichage de la
      // colonne "OPCO" de la liste globale /a-facturer ; il ne pese pas dans
      // le montant retenu ici, donc pas besoin de le resoudre.
      opcoByContratId: new Map(),
      today,
    });
    retardFacturationCommission = round2(
      rows.reduce((sum, r) => sum + (r.montant ?? 0), 0),
    );
    lignesRetardFacturationCommission = rows.map((r) => ({
      id: r.contratId,
      label: contratLabel(r),
      detail: `Echeance ouverte le ${r.openingDate} (${r.retardJours} j)${
        r.echeancesDuesCount > 1
          ? ` - ${r.echeancesDuesCount} echeances dues`
          : ''
      }`,
      montant: r.montant ?? 0,
    }));
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
