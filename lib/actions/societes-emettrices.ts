'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/queries/users';
import { logAudit } from '@/lib/utils/audit';
import { logger } from '@/lib/utils/logger';
import { isAdmin } from '@/lib/utils/roles';

const SocieteEmettriceSchema = z.object({
  code: z
    .string()
    .min(2, { message: 'Le code est invalide (min 2 caracteres)' })
    .max(8)
    .regex(/^[A-Z0-9]+$/, {
      message: 'Le code doit etre en majuscules et chiffres (ex: SOL, DIG)',
    }),
  raison_sociale: z.string().min(1, 'La raison sociale est obligatoire'),
  forme_juridique: z.string().nullish(),
  siret: z.string().min(1, 'Le SIRET est obligatoire'),
  tva_intracom: z.string().min(1, 'La TVA intracom est obligatoire'),
  capital_social: z.number().nullish(),
  adresse: z.string().min(1, "L'adresse est obligatoire"),
  code_postal: z.string().min(1, 'Le code postal est obligatoire'),
  ville: z.string().min(1, 'La ville est obligatoire'),
  pays: z.string().default('France'),
  email_contact: z.string().email('Email invalide'),
  telephone: z.string().nullish(),
  logo_url: z.string().nullish(),
  banque_nom: z.string().nullish(),
  banque_iban: z.string().nullish(),
  banque_bic: z.string().nullish(),
  mentions_legales: z.string().nullish(),
  conditions_reglement_default: z.string().nullish(),
  validite_devis_jours: z.number().int().positive().default(90),
  odoo_company_id: z.number().int().nullish(),
  odoo_journal_id: z.number().int().nullish(),
  est_defaut: z.boolean().default(false),
});

export type SocieteEmettriceInput = z.input<typeof SocieteEmettriceSchema>;

type ActionResult<T = object> =
  | ({ success: true } & T)
  | { success: false; error: string };

export async function createSocieteEmettrice(
  input: SocieteEmettriceInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) {
    return { success: false, error: 'Acces refuse (admin requis)' };
  }

  const parsed = SocieteEmettriceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('societes_emettrices')
    .insert({ ...parsed.data, actif: true })
    .select('id')
    .single();

  if (error) {
    logger.error('actions.societes_emettrices', 'create failed', { error });
    return { success: false, error: error.message };
  }

  logAudit('societe_emettrice_created', 'societes_emettrices', data.id, {
    code: parsed.data.code,
    raison_sociale: parsed.data.raison_sociale,
  });

  revalidatePath('/admin/parametres/societes-emettrices');
  return { success: true, id: data.id };
}

export async function updateSocieteEmettrice(
  id: string,
  input: Partial<SocieteEmettriceInput>,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) {
    return { success: false, error: 'Acces refuse (admin requis)' };
  }

  const PartialSchema = SocieteEmettriceSchema.partial();
  const parsed = PartialSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('societes_emettrices')
    .update(parsed.data)
    .eq('id', id);

  if (error) {
    logger.error('actions.societes_emettrices', 'update failed', { id, error });
    return { success: false, error: error.message };
  }

  logAudit('societe_emettrice_updated', 'societes_emettrices', id, {
    fields: Object.keys(parsed.data),
  });

  revalidatePath('/admin/parametres/societes-emettrices');
  revalidatePath(`/admin/parametres/societes-emettrices/${id}`);
  return { success: true };
}

export async function archiveSocieteEmettrice(
  id: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) {
    return { success: false, error: 'Acces refuse (admin requis)' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('societes_emettrices')
    .update({ actif: false })
    .eq('id', id);

  if (error) {
    logger.error('actions.societes_emettrices', 'archive failed', {
      id,
      error,
    });
    return { success: false, error: error.message };
  }

  logAudit('societe_emettrice_archived', 'societes_emettrices', id);

  revalidatePath('/admin/parametres/societes-emettrices');
  return { success: true };
}
