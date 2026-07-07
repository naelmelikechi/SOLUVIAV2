'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createCrmClient } from '@/lib/crm/supabase/server';
import { requireCrmUser } from '@/lib/crm/auth/roles';
import { dbFail } from '@/lib/crm/actions/errors';
import {
  adresseSchema,
  toAdresseRow,
  isAdresseVide,
} from '@/lib/crm/validators/adresse';
import type { AdresseInput } from '@/lib/crm/validators/adresse';

const uuid = z.string().uuid();

/** Ajoute une adresse à une société. */
export async function addAdresse(
  compteId: string,
  input: AdresseInput,
): Promise<void> {
  await requireCrmUser();
  if (!uuid.safeParse(compteId).success)
    return dbFail(null, 'Société invalide');
  const parsed = adresseSchema.parse(input);
  if (isAdresseVide(parsed)) return dbFail(null, 'Adresse vide');
  const supabase = await createCrmClient();
  const { error } = await supabase
    .from('adresses')
    .insert({ compte_id: compteId, ...toAdresseRow(parsed) });
  if (error) dbFail(error, "Ajout de l'adresse impossible");
  revalidatePath('/crm/pipeline');
}

/** Modifie une adresse existante. */
export async function updateAdresse(
  adresseId: string,
  input: AdresseInput,
): Promise<void> {
  await requireCrmUser();
  if (!uuid.safeParse(adresseId).success)
    return dbFail(null, 'Adresse invalide');
  const parsed = adresseSchema.parse(input);
  const supabase = await createCrmClient();
  const { error } = await supabase
    .from('adresses')
    .update(toAdresseRow(parsed))
    .eq('id', adresseId);
  if (error) dbFail(error, "Mise à jour de l'adresse impossible");
  revalidatePath('/crm/pipeline');
}

/** Supprime une adresse. */
export async function deleteAdresse(adresseId: string): Promise<void> {
  await requireCrmUser();
  if (!uuid.safeParse(adresseId).success)
    return dbFail(null, 'Adresse invalide');
  const supabase = await createCrmClient();
  const { error } = await supabase
    .from('adresses')
    .delete()
    .eq('id', adresseId);
  if (error) dbFail(error, "Suppression de l'adresse impossible");
  revalidatePath('/crm/pipeline');
}

/** Définit une adresse comme principale (démarque les autres du même compte). */
export async function setAdressePrincipale(
  compteId: string,
  adresseId: string,
): Promise<void> {
  await requireCrmUser();
  if (!uuid.safeParse(compteId).success || !uuid.safeParse(adresseId).success) {
    return dbFail(null, 'Identifiant invalide');
  }
  const supabase = await createCrmClient();
  // Démarquer AVANT de marquer : jamais deux `principal=true` simultanés, donc
  // compatible avec l'index unique partiel `adresses_principal_uniq`, qui
  // interdit par ailleurs deux appels concurrents de laisser deux principales.
  const { error: clearErr } = await supabase
    .from('adresses')
    .update({ principal: false })
    .eq('compte_id', compteId)
    .neq('id', adresseId);
  if (clearErr) dbFail(clearErr, 'Mise à jour des adresses impossible');
  const { error } = await supabase
    .from('adresses')
    .update({ principal: true })
    .eq('id', adresseId);
  if (error) dbFail(error, "Mise à jour de l'adresse impossible");
  revalidatePath('/crm/pipeline');
}
