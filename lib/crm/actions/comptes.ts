'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createCrmClient } from '@/lib/crm/supabase/server';
import { requireCrmUser } from '@/lib/crm/auth/roles';
import { dbFail } from '@/lib/crm/actions/errors';

const uuid = z.string().uuid();

// "" -> null pour rester propre en base (pas de chaîne vide sur des champs INSEE).
const optText = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v == null || v === '' ? null : v));

const optInt = z.preprocess(
  (v) => (v === '' || v == null ? null : v),
  z.coerce.number().int().min(0).nullable(),
);

const optNum = z.preprocess(
  (v) => (v === '' || v == null ? null : v),
  z.coerce.number().min(0).nullable(),
);

// Champs identité INSEE d'un compte (A4/A5). `insee_verifie` passe à true quand la
// fiche a été enrichie via l'API Sirene, false en saisie purement manuelle.
const compteInseeSchema = z.object({
  siren: optText,
  siret: optText,
  forme_juridique: optText,
  code_naf: optText,
  naf_libelle: optText,
  effectif_tranche: optText,
  nb_implantations: optInt,
  ca_dernier_exercice: optNum,
  insee_verifie: z.boolean().optional().default(false),
});
export type CompteInseeInput = z.input<typeof compteInseeSchema>;

/** Met à jour les champs identité/INSEE d'un compte (update partiel). */
export async function updateCompteInsee(
  id: string,
  fields: CompteInseeInput,
): Promise<void> {
  await requireCrmUser();
  if (!uuid.safeParse(id).success) return dbFail(null, 'Société invalide');
  const parsed = compteInseeSchema.parse(fields);
  const supabase = await createCrmClient();
  const { error } = await supabase.from('comptes').update(parsed).eq('id', id);
  if (error) dbFail(error, 'Mise à jour de la société impossible');
  revalidatePath('/crm/pipeline');
}
