import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/utils/roles';
import { logger } from '@/lib/utils/logger';
import {
  EMPLOYEE_COST_DEFAULTS_FALLBACK,
  type EmployeeCostDefaults,
  type EmployeeCostInputs,
} from '@/lib/utils/employee-cost';

// Les colonnes de coût employé ont été révoquées du rôle `authenticated` au
// niveau Postgres (cf. migration user_cost_fields). On ne peut donc les lire
// qu'avec le service_role (createAdminClient). Cette query verifie le role
// du caller en amont pour eviter une fuite via une appel server-side malveillant.

export async function assertAdmin(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté');
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!isAdmin(profile?.role)) {
    throw new Error('Accès admin requis');
  }
}

export async function getUserCostInfo(
  userId: string,
): Promise<EmployeeCostInputs> {
  await assertAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('users')
    .select(
      'salaire_brut_annuel, primes_annuelles, avantages_annuels, taux_charges_patronales, heures_hebdo, jours_conges_payes, jours_rtt',
    )
    .eq('id', userId)
    .single();

  if (error || !data) {
    logger.error('queries.employee-cost', 'getUserCostInfo failed', {
      userId,
      error,
    });
    return {
      salaire_brut_annuel: null,
      primes_annuelles: null,
      avantages_annuels: null,
      taux_charges_patronales: null,
      heures_hebdo: null,
      jours_conges_payes: null,
      jours_rtt: null,
    };
  }

  return data;
}

/**
 * Defaults SOLUVIA-wide non sensibles (pas de donnee personnelle, juste des
 * valeurs de reference pour le calcul de rentabilite). Lisibles depuis tout
 * server context — pas de assertAdmin requis.
 */
export async function getEmployeeCostDefaults(): Promise<EmployeeCostDefaults> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('parametres')
    .select('cle, valeur')
    .eq('categorie', 'cout_employe');

  if (error || !data) {
    logger.warn('queries.employee-cost', 'fallback defaults used', { error });
    return EMPLOYEE_COST_DEFAULTS_FALLBACK;
  }

  const map = new Map(data.map((p) => [p.cle, Number(p.valeur)]));
  return {
    salaire_brut_annuel:
      map.get('salaire_brut_annuel_defaut') ??
      EMPLOYEE_COST_DEFAULTS_FALLBACK.salaire_brut_annuel,
    primes_annuelles:
      map.get('primes_annuelles_defaut') ??
      EMPLOYEE_COST_DEFAULTS_FALLBACK.primes_annuelles,
    avantages_annuels:
      map.get('avantages_annuels_defaut') ??
      EMPLOYEE_COST_DEFAULTS_FALLBACK.avantages_annuels,
    taux_charges_patronales:
      map.get('taux_charges_patronales_defaut') ??
      EMPLOYEE_COST_DEFAULTS_FALLBACK.taux_charges_patronales,
    heures_hebdo:
      map.get('heures_hebdo_defaut') ??
      EMPLOYEE_COST_DEFAULTS_FALLBACK.heures_hebdo,
    jours_conges_payes:
      map.get('jours_conges_payes_defaut') ??
      EMPLOYEE_COST_DEFAULTS_FALLBACK.jours_conges_payes,
    jours_rtt:
      map.get('jours_rtt_defaut') ?? EMPLOYEE_COST_DEFAULTS_FALLBACK.jours_rtt,
  };
}
