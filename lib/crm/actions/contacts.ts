'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createCrmClient } from '@/lib/crm/supabase/server';
import { requireCrmUser } from '@/lib/crm/auth/roles';
import { dbFail } from '@/lib/crm/actions/errors';

const uuid = z.string().uuid();

// Rôle dans la décision + sensibilités d'un interlocuteur (A4/A5). "" -> null.
const contactRoleSchema = z.object({
  role_decision: z.preprocess(
    (v) => (v === '' || v == null ? null : v),
    z
      .enum(['signataire', 'sponsor', 'operationnel', 'drh', 'soutien'])
      .nullable(),
  ),
  sensibilites: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v == null || v === '' ? null : v)),
});
export type ContactRoleInput = z.input<typeof contactRoleSchema>;

/** Met à jour le rôle décisionnel et les sensibilités d'un contact. */
export async function updateContactRole(
  id: string,
  input: ContactRoleInput,
): Promise<void> {
  await requireCrmUser();
  if (!uuid.safeParse(id).success) return dbFail(null, 'Contact invalide');
  const parsed = contactRoleSchema.parse(input);
  const supabase = await createCrmClient();
  const { error } = await supabase.from('contacts').update(parsed).eq('id', id);
  if (error) dbFail(error, 'Mise à jour du contact impossible');
  revalidatePath('/crm/pipeline');
}
