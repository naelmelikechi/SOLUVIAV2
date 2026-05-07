'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertAdmin } from '@/lib/queries/employee-cost';
import type { EmployeeCostInputs } from '@/lib/utils/employee-cost';

// Bornes raisonnables : un salaire annuel > 1M€ ou des heures > 80/sem
// indiquent une saisie corrompue plutot qu un cas legitime.
const employeeCostFieldsSchema = z.object({
  salaire_brut_annuel: z.number().finite().gte(0).lte(2_000_000),
  primes_annuelles: z.number().finite().gte(0).lte(2_000_000),
  avantages_annuels: z.number().finite().gte(0).lte(500_000),
  taux_charges_patronales: z.number().finite().gte(0).lte(100),
  heures_hebdo: z.number().finite().gte(0).lte(80),
  jours_conges_payes: z.number().finite().gte(0).lte(60),
  jours_rtt: z.number().finite().gte(0).lte(60),
});

const UpdateUserCostSchema = z.object({
  userId: z.string().uuid('User ID doit etre un UUID'),
  fields: employeeCostFieldsSchema,
});

export async function updateUserCost(
  userId: string,
  fields: EmployeeCostInputs,
): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateUserCostSchema.safeParse({ userId, fields });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }
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
  const parsed = employeeCostFieldsSchema.safeParse(fields);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }
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
