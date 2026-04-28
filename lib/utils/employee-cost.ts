// Calcul du coût horaire annualisé d'un employé.
// Le résultat sert à valoriser le temps passé dans la formule de rentabilité
// projet. Tout est lissé sur l'année pour amortir CP, RTT et jours fériés.

export interface EmployeeCostInputs {
  salaire_brut_annuel: number | null;
  primes_annuelles: number | null;
  avantages_annuels: number | null;
  taux_charges_patronales: number | null;
  heures_hebdo: number | null;
  jours_conges_payes: number | null;
  jours_rtt: number | null;
}

export interface EmployeeCostDefaults {
  salaire_brut_annuel: number;
  primes_annuelles: number;
  avantages_annuels: number;
  taux_charges_patronales: number;
  heures_hebdo: number;
  jours_conges_payes: number;
  jours_rtt: number;
}

export const EMPLOYEE_COST_DEFAULTS_FALLBACK: EmployeeCostDefaults = {
  salaire_brut_annuel: 40_000,
  primes_annuelles: 0,
  avantages_annuels: 1_800,
  taux_charges_patronales: 42,
  heures_hebdo: 35,
  jours_conges_payes: 25,
  jours_rtt: 0,
};

const JOURS_FERIES_MOYEN_FR = 9; // jours ouvrés feriés, moyenne lissée

export interface EmployeeCostBreakdown {
  brutCharge: number;
  primes: number;
  avantages: number;
  coutTotalAnnuel: number;
  heuresTheoriques: number;
  heuresNonTravaillees: number;
  heuresEffectives: number;
  coutHoraire: number;
}

/**
 * Resout les valeurs effectives d'un employe en tombant sur les defauts SOLUVIA
 * pour chaque champ non renseigne. Tous les defauts ont eux-memes un fallback
 * dur en cas d'absence en DB.
 */
export function resolveEmployeeCost(
  employee: EmployeeCostInputs,
  defaults: Partial<EmployeeCostDefaults> = {},
): EmployeeCostDefaults {
  const d = { ...EMPLOYEE_COST_DEFAULTS_FALLBACK, ...defaults };
  return {
    salaire_brut_annuel: employee.salaire_brut_annuel ?? d.salaire_brut_annuel,
    primes_annuelles: employee.primes_annuelles ?? d.primes_annuelles,
    avantages_annuels: employee.avantages_annuels ?? d.avantages_annuels,
    taux_charges_patronales:
      employee.taux_charges_patronales ?? d.taux_charges_patronales,
    heures_hebdo: employee.heures_hebdo ?? d.heures_hebdo,
    jours_conges_payes: employee.jours_conges_payes ?? d.jours_conges_payes,
    jours_rtt: employee.jours_rtt ?? d.jours_rtt,
  };
}

/**
 * Calcule le cout horaire annualise.
 *
 *  cout_total = brut * (1 + taux_charges/100) + primes + avantages
 *  heures_theoriques = heures_hebdo * 52
 *  heures_non_travaillees = (CP + RTT + 9_feries) * (heures_hebdo / 5)
 *  heures_effectives = heures_theoriques - heures_non_travaillees
 *  cout_horaire = cout_total / heures_effectives
 */
export function computeHourlyCost(
  values: EmployeeCostDefaults,
): EmployeeCostBreakdown {
  const brutCharge =
    values.salaire_brut_annuel * (1 + values.taux_charges_patronales / 100);
  const coutTotalAnnuel =
    brutCharge + values.primes_annuelles + values.avantages_annuels;

  const heuresTheoriques = values.heures_hebdo * 52;
  const joursParSemaine = 5;
  const heuresParJour = values.heures_hebdo / joursParSemaine;
  const heuresNonTravaillees =
    (values.jours_conges_payes + values.jours_rtt + JOURS_FERIES_MOYEN_FR) *
    heuresParJour;
  const heuresEffectives = Math.max(1, heuresTheoriques - heuresNonTravaillees);

  const coutHoraire = coutTotalAnnuel / heuresEffectives;

  return {
    brutCharge,
    primes: values.primes_annuelles,
    avantages: values.avantages_annuels,
    coutTotalAnnuel,
    heuresTheoriques,
    heuresNonTravaillees,
    heuresEffectives,
    coutHoraire,
  };
}
