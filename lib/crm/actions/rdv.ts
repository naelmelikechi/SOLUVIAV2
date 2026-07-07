'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createCrmClient } from '@/lib/crm/supabase/server';
import { requireCrmUser } from '@/lib/crm/auth/roles';
import { dbFail } from '@/lib/crm/actions/errors';
import { rdvSchema, type RdvInput } from '@/lib/crm/validators/rdv';
import { RDV_STATUTS, type RdvStatut } from '@/lib/crm/domain/enums';
import { isHiddenEmail } from '@/lib/crm/auth/hidden';
import {
  createNotifications,
  excerpt,
  actorName,
} from '@/lib/crm/notifications/notify';

export async function createRdv(input: RdvInput): Promise<void> {
  const user = await requireCrmUser();
  const { commerciaux, ...rdvFields } = rdvSchema.parse(input);
  const supabase = await createCrmClient();
  const { data, error } = await supabase
    .from('rdv')
    .insert({ ...rdvFields, created_by: user.id })
    .select('id')
    .single();
  if (error) dbFail(error, 'Création du RDV impossible');
  // Commerciaux assignés ; à défaut le créateur - sauf si c'est un compte fantôme
  // (qui ne doit apparaître nulle part).
  const ids = commerciaux.length
    ? commerciaux
    : !isHiddenEmail(user.email)
      ? [user.id]
      : [];
  if (ids.length) {
    // rdv_commerciaux référence `public.users` (SOLUVIA) via `user_id`.
    const { error: liaisonError } = await supabase
      .from('rdv_commerciaux')
      .insert(ids.map((user_id) => ({ rdv_id: data.id, user_id })));
    if (liaisonError)
      dbFail(liaisonError, 'Assignation des commerciaux impossible');
  }

  // Notifs d'assignation (best-effort) pour chaque commercial assigné ≠ créateur.
  const cibles = [...new Set(ids)].filter((id) => id && id !== user.id);
  if (cibles.length > 0) {
    const auteurNom = await actorName(supabase, user);
    await createNotifications(
      supabase,
      cibles.map((uid) => ({
        user_id: uid,
        actor_id: user.id,
        type: 'rdv_assigned' as const,
        contenu: `${auteurNom} vous a assigné un RDV : ${excerpt(rdvFields.titre)}`,
        link: `/crm/rdv?rdv=${data.id}`,
      })),
    );
  }
  revalidatePath('/crm/rdv');
  if (rdvFields.opportunite_id) revalidatePath('/crm/pipeline');
}

// Aligné sur les autres actions : parse Zod avant tout write (c'était la seule
// action du projet sans schéma - audit 2026-07-06).
const compteRenduSchema = z.object({
  compte_rendu: z.string(),
  statut: z.enum(RDV_STATUTS),
});

export async function updateRdvCompteRendu(
  id: string,
  compte_rendu: string,
  statut: RdvStatut,
): Promise<void> {
  await requireCrmUser();
  const parsed = compteRenduSchema.parse({ compte_rendu, statut });
  const supabase = await createCrmClient();
  const { error } = await supabase.from('rdv').update(parsed).eq('id', id);
  if (error) dbFail(error, 'Enregistrement du RDV impossible');
  revalidatePath('/crm/rdv');
}
