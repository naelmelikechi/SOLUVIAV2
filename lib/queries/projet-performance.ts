import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import {
  computeHourlyCost,
  resolveEmployeeCost,
  type EmployeeCostDefaults,
  type EmployeeCostInputs,
} from '@/lib/utils/employee-cost';
import { getEmployeeCostDefaults } from '@/lib/queries/employee-cost';

export interface VoletPerformance {
  // valeur % numerique (null si pas calculable). Pour rentabilite: % marge.
  value: number | null;
  // affichage formate (ex "85 %", "42,80 €/h", "—")
  display: string;
  // good/warn/bad pour la couleur. Neutral si pas de seuil.
  status: 'good' | 'warn' | 'bad' | 'neutral';
  formula: string;
  // ex: "23 contrats / 31 contrats actifs"
  detail: string;
  // pour Abandons : plus bas = mieux. Inverse les seuils.
  invertScale?: boolean;
}

export interface ProjetPerformance {
  pedagogie: VoletPerformance;
  reussite: VoletPerformance;
  financement: VoletPerformance;
  abandons: VoletPerformance;
  rentabilite: VoletPerformance;
}

const NULL_VOLET = (formula: string): VoletPerformance => ({
  value: null,
  display: '—',
  status: 'neutral',
  formula,
  detail: 'Données insuffisantes',
});

function pct(n: number | null): string {
  if (n == null) return '—';
  return `${Math.round(n)} %`;
}

function statusFromPct(
  value: number,
  invert = false,
): VoletPerformance['status'] {
  // Vert >= 80, orange 50-79, rouge < 50. Inverse pour Abandons.
  const v = invert ? 100 - value : value;
  if (v >= 80) return 'good';
  if (v >= 50) return 'warn';
  return 'bad';
}

export async function getProjetPerformance(
  projetId: string,
): Promise<ProjetPerformance> {
  const admin = createAdminClient();
  const defaults = await getEmployeeCostDefaults().catch(() => null);
  const safeDefaults = defaults ?? {
    salaire_brut_annuel: 40_000,
    primes_annuelles: 0,
    avantages_annuels: 1_800,
    taux_charges_patronales: 42,
    heures_hebdo: 35,
    jours_conges_payes: 25,
    jours_rtt: 0,
  };

  // Charge en parallele : contrats + progressions + invoice_steps + factures + saisies + users
  const [contratsRes, invoiceStepsRes, facturesRes, saisiesRes] =
    await Promise.all([
      admin
        .from('contrats')
        .select(
          'id, contract_state, date_debut, date_fin, eduvia_id, contrats_progressions(progression_percentage, average_score)',
        )
        .eq('projet_id', projetId)
        .eq('archive', false),
      admin
        .from('eduvia_invoice_steps')
        .select(
          'total_amount, paid_amount, contrat:contrats!eduvia_invoice_steps_contrat_id_fkey(projet_id)',
        ),
      admin
        .from('factures')
        .select('montant_ht, est_avoir')
        .eq('projet_id', projetId),
      admin
        .from('saisies_temps')
        .select('heures, user_id')
        .eq('projet_id', projetId),
    ]);

  if (contratsRes.error) {
    logger.error('queries.projet-performance', 'contrats fetch failed', {
      projetId,
      error: contratsRes.error,
    });
  }

  type ContratWithProgression = {
    id: string;
    contract_state: string;
    date_debut: string | null;
    date_fin: string | null;
    contrats_progressions:
      | { progression_percentage: number | null; average_score: number | null }
      | {
          progression_percentage: number | null;
          average_score: number | null;
        }[]
      | null;
  };

  const contrats = (contratsRes.data ?? []) as ContratWithProgression[];

  // ─── Pédagogie ──────────────────────────────────────────────────────
  // Moyenne (progression_reelle / progression_theorique × 100) sur les contrats actifs.
  // 100 % = on time. Au-dessus = en avance, en-dessous = en retard.
  const pedagogieRows = contrats
    .filter((c) =>
      [
        'actif',
        'ENGAGE',
        'EN_COURS_INSTRUCTION',
        'TRANSMIS',
        'NOTSENT',
      ].includes(c.contract_state),
    )
    .map((c) => {
      const prog = Array.isArray(c.contrats_progressions)
        ? c.contrats_progressions[0]
        : c.contrats_progressions;
      const realPct = prog?.progression_percentage;
      if (realPct == null || c.date_debut == null || c.date_fin == null) {
        return null;
      }
      const start = new Date(c.date_debut).getTime();
      const end = new Date(c.date_fin).getTime();
      const now = Date.now();
      const total = end - start;
      if (total <= 0) return null;
      const elapsed = Math.max(0, Math.min(total, now - start));
      const theoretical = (elapsed / total) * 100;
      if (theoretical <= 0) return null;
      return { real: realPct, theoretical };
    })
    .filter((x): x is { real: number; theoretical: number } => x !== null);

  let pedagogie: VoletPerformance;
  if (pedagogieRows.length === 0) {
    pedagogie = NULL_VOLET(
      'Moyenne du ratio progression réelle / progression théorique sur les contrats actifs.',
    );
  } else {
    const ratios = pedagogieRows.map((r) => (r.real / r.theoretical) * 100);
    const avg = ratios.reduce((s, r) => s + r, 0) / ratios.length;
    const cleaned = Math.max(0, avg);
    pedagogie = {
      value: cleaned,
      display: pct(cleaned),
      status: statusFromPct(Math.min(100, cleaned)),
      formula:
        'Pédagogie = moyenne de (progression réelle / progression théorique × 100). 100 % = pile dans les temps. >100 % = en avance.',
      detail: `${pedagogieRows.length} contrat${pedagogieRows.length > 1 ? 's' : ''} avec progression Eduvia · moyenne réelle ${Math.round(pedagogieRows.reduce((s, r) => s + r.real, 0) / pedagogieRows.length)} % vs théorique ${Math.round(pedagogieRows.reduce((s, r) => s + r.theoretical, 0) / pedagogieRows.length)} %`,
    };
  }

  // ─── Réussite ──────────────────────────────────────────────────────
  // Moyenne des average_score sur les contrats avec score renseigne.
  const scoreRows = contrats
    .map((c) => {
      const prog = Array.isArray(c.contrats_progressions)
        ? c.contrats_progressions[0]
        : c.contrats_progressions;
      return prog?.average_score;
    })
    .filter((s): s is number => typeof s === 'number' && s > 0);

  let reussite: VoletPerformance;
  if (scoreRows.length === 0) {
    reussite = NULL_VOLET(
      'Moyenne des average_score Eduvia sur les contrats avec évaluation.',
    );
  } else {
    const avg = scoreRows.reduce((s, x) => s + x, 0) / scoreRows.length;
    reussite = {
      value: avg,
      display: pct(avg),
      status: statusFromPct(avg),
      formula:
        'Réussite = moyenne des average_score Eduvia (%). Note moyenne aux séquences validées.',
      detail: `${scoreRows.length} contrat${scoreRows.length > 1 ? 's' : ''} avec score · moyenne ${Math.round(avg)} %`,
    };
  }

  // ─── Financement ────────────────────────────────────────────────────
  // SUM(paid_amount) / SUM(total_amount) sur les invoice_steps des contrats du projet.
  type InvoiceStepRow = {
    total_amount: number | null;
    paid_amount: number | null;
    contrat:
      | { projet_id: string | null }
      | { projet_id: string | null }[]
      | null;
  };
  const invoiceStepsRaw = (invoiceStepsRes.data ?? []) as InvoiceStepRow[];
  const invoiceSteps = invoiceStepsRaw.filter((s) => {
    const c = Array.isArray(s.contrat) ? s.contrat[0] : s.contrat;
    return c?.projet_id === projetId;
  });

  const totalAmount = invoiceSteps.reduce(
    (s, x) => s + (x.total_amount ?? 0),
    0,
  );
  const paidAmount = invoiceSteps.reduce((s, x) => s + (x.paid_amount ?? 0), 0);

  let financement: VoletPerformance;
  if (totalAmount <= 0) {
    financement = NULL_VOLET(
      'Part du financement OPCO déjà versé / total prévu sur les invoice_steps Eduvia.',
    );
  } else {
    const ratio = (paidAmount / totalAmount) * 100;
    financement = {
      value: ratio,
      display: pct(ratio),
      status: statusFromPct(ratio),
      formula:
        'Financement = paid_amount cumulé / total_amount cumulé × 100 sur les invoice_steps Eduvia du projet.',
      detail: `${Math.round(paidAmount).toLocaleString('fr-FR')} € versés / ${Math.round(totalAmount).toLocaleString('fr-FR')} € prévus`,
    };
  }

  // ─── Abandons ──────────────────────────────────────────────────────
  const totalContrats = contrats.length;
  const ABANDON_STATES = new Set(['ANNULE', 'resilie']);
  const abandonsCount = contrats.filter((c) =>
    ABANDON_STATES.has(c.contract_state),
  ).length;

  let abandons: VoletPerformance;
  if (totalContrats === 0) {
    abandons = NULL_VOLET(
      'Part des contrats annulés ou résiliés sur le total des contrats du projet.',
    );
  } else {
    const ratio = (abandonsCount / totalContrats) * 100;
    abandons = {
      value: ratio,
      display: pct(ratio),
      status: statusFromPct(ratio, true),
      formula:
        "Abandons = contrats annulés ou résiliés / total contrats × 100. Plus c'est bas, mieux c'est.",
      detail: `${abandonsCount} abandon${abandonsCount > 1 ? 's' : ''} sur ${totalContrats} contrat${totalContrats > 1 ? 's' : ''}`,
      invertScale: true,
    };
  }

  // ─── Rentabilité ────────────────────────────────────────────────────
  // Marge nette: (recettes - coûts) / recettes × 100
  // Recettes = somme factures.montant_ht (les avoirs comptent en négatif)
  // Coûts = somme par user (heures × cout_horaire calcule)

  type FactureRow = { montant_ht: number; est_avoir: boolean };
  type SaisieRow = { heures: number; user_id: string };
  const factures = (facturesRes.data ?? []) as FactureRow[];
  const saisies = (saisiesRes.data ?? []) as SaisieRow[];

  const recettes = factures.reduce(
    (s, f) => s + (f.est_avoir ? -f.montant_ht : f.montant_ht),
    0,
  );

  // Charge cost data des users qui ont saisi des heures sur ce projet
  const hoursPerUser = new Map<string, number>();
  for (const s of saisies) {
    hoursPerUser.set(s.user_id, (hoursPerUser.get(s.user_id) ?? 0) + s.heures);
  }
  const userIds = Array.from(hoursPerUser.keys());

  let coutsTemps = 0;
  if (userIds.length > 0) {
    const usersCostRes = await admin
      .from('users')
      .select(
        'id, salaire_brut_annuel, primes_annuelles, avantages_annuels, taux_charges_patronales, heures_hebdo, jours_conges_payes, jours_rtt',
      )
      .in('id', userIds);

    type UserCostRow = { id: string } & EmployeeCostInputs;
    const usersCost = (usersCostRes.data ?? []) as UserCostRow[];

    for (const userId of userIds) {
      const hours = hoursPerUser.get(userId) ?? 0;
      const u = usersCost.find((x) => x.id === userId);
      const inputs: EmployeeCostInputs = u ?? {
        salaire_brut_annuel: null,
        primes_annuelles: null,
        avantages_annuels: null,
        taux_charges_patronales: null,
        heures_hebdo: null,
        jours_conges_payes: null,
        jours_rtt: null,
      };
      const breakdown = computeHourlyCost(
        resolveEmployeeCost(inputs, safeDefaults as EmployeeCostDefaults),
      );
      coutsTemps += hours * breakdown.coutHoraire;
    }
  }

  let rentabilite: VoletPerformance;
  if (recettes <= 0) {
    rentabilite = NULL_VOLET(
      'Marge nette = (recettes SOLUVIA − coût temps) / recettes × 100. Pas de facture émise pour ce projet.',
    );
  } else {
    const marge = ((recettes - coutsTemps) / recettes) * 100;
    rentabilite = {
      value: marge,
      display: pct(marge),
      status: statusFromPct(marge),
      formula:
        'Rentabilité = (recettes SOLUVIA − coût temps) / recettes × 100. Coût temps = somme(heures × coût horaire annualisé du CDP).',
      detail: `${Math.round(recettes).toLocaleString('fr-FR')} € facturés − ${Math.round(coutsTemps).toLocaleString('fr-FR')} € de temps (${saisies.reduce((s, x) => s + x.heures, 0).toFixed(1)} h saisies)`,
    };
  }

  return { pedagogie, reussite, financement, abandons, rentabilite };
}
