'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertAdmin } from '@/lib/queries/employee-cost';
import type { EmployeeCostInputs } from '@/lib/utils/employee-cost';

export async function updateUserCost(
  userId: string,
  fields: EmployeeCostInputs,
): Promise<{ success: boolean; error?: string }> {
  try {
    await assertAdmin();
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Accès refusé',
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('users')
    .update({
      salaire_brut_annuel: fields.salaire_brut_annuel,
      primes_annuelles: fields.primes_annuelles,
      avantages_annuels: fields.avantages_annuels,
      taux_charges_patronales: fields.taux_charges_patronales,
      heures_hebdo: fields.heures_hebdo,
      jours_conges_payes: fields.jours_conges_payes,
      jours_rtt: fields.jours_rtt,
    })
    .eq('id', userId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/utilisateurs');
  return { success: true };
}

export async function updateEmployeeCostDefaults(fields: {
  salaire_brut_annuel: number;
  primes_annuelles: number;
  avantages_annuels: number;
  taux_charges_patronales: number;
  heures_hebdo: number;
  jours_conges_payes: number;
  jours_rtt: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await assertAdmin();
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Accès refusé',
    };
  }

  const admin = createAdminClient();
  const updates: Array<[string, string]> = [
    ['salaire_brut_annuel_defaut', String(fields.salaire_brut_annuel)],
    ['primes_annuelles_defaut', String(fields.primes_annuelles)],
    ['avantages_annuels_defaut', String(fields.avantages_annuels)],
    ['taux_charges_patronales_defaut', String(fields.taux_charges_patronales)],
    ['heures_hebdo_defaut', String(fields.heures_hebdo)],
    ['jours_conges_payes_defaut', String(fields.jours_conges_payes)],
    ['jours_rtt_defaut', String(fields.jours_rtt)],
  ];

  for (const [cle, valeur] of updates) {
    const { error } = await admin
      .from('parametres')
      .update({ valeur })
      .eq('categorie', 'cout_employe')
      .eq('cle', cle);
    if (error) return { success: false, error: error.message };
  }

  revalidatePath('/admin/parametres');
  return { success: true };
}
