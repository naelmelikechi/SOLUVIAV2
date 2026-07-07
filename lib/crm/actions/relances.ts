'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createCrmClient } from '@/lib/crm/supabase/server';
import { requireCrmUser } from '@/lib/crm/auth/roles';
import { dbFail } from '@/lib/crm/actions/errors';
import { relanceSchema, type RelanceInput } from '@/lib/crm/validators/relance';
import { PRIORITES } from '@/lib/crm/domain/enums';
import {
  createNotifications,
  excerpt,
  actorName,
} from '@/lib/crm/notifications/notify';

// Édition rapide d'une relance (rééchéancer / reprioriser). Update PARTIEL :
// ne touche que ces 3 colonnes, jamais opportunite_id/compte_id/assignee_id/note.
const relanceFieldsSchema = z.object({
  titre: z.string().min(1, 'Titre requis'),
  date_echeance: z.string().min(1, 'Échéance requise'),
  priorite: z.enum(PRIORITES),
});
export type RelanceFieldsInput = z.input<typeof relanceFieldsSchema>;

export async function updateRelanceFields(
  id: string,
  input: RelanceFieldsInput,
): Promise<void> {
  await requireCrmUser();
  const parsed = relanceFieldsSchema.parse(input);
  const supabase = await createCrmClient();
  const { error } = await supabase.from('relances').update(parsed).eq('id', id);
  if (error) dbFail(error, 'Mise à jour de la relance impossible');
  revalidatePath('/crm/relances');
}

export async function createRelance(input: RelanceInput): Promise<void> {
  const user = await requireCrmUser();
  const parsed = relanceSchema.parse(input);
  const supabase = await createCrmClient();
  const assigneeId = parsed.assignee_id ?? user.id;
  const { error } = await supabase
    .from('relances')
    .insert({ ...parsed, created_by: user.id, assignee_id: assigneeId });
  if (error) dbFail(error, 'Création de la relance impossible');

  // Notif d'assignation (best-effort) si on assigne à quelqu'un d'autre.
  if (assigneeId && assigneeId !== user.id) {
    const auteurNom = await actorName(supabase, user);
    await createNotifications(supabase, [
      {
        user_id: assigneeId,
        actor_id: user.id,
        type: 'relance_assigned',
        contenu: `${auteurNom} vous a assigné une relance : ${excerpt(parsed.titre)}`,
        link: parsed.opportunite_id
          ? `/crm/pipeline?opp=${parsed.opportunite_id}`
          : '/crm/relances',
      },
    ]);
  }
  revalidatePath('/crm/relances');
  if (parsed.opportunite_id) revalidatePath('/crm/pipeline');
}

export async function toggleRelance(id: string, fait: boolean): Promise<void> {
  await requireCrmUser();
  const supabase = await createCrmClient();
  const { error } = await supabase
    .from('relances')
    .update({ fait, date_fait: fait ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) dbFail(error, 'Mise à jour de la relance impossible');
  revalidatePath('/crm/relances');
  // Les relances s'affichent aussi dans le drawer opportunité : sans cette
  // revalidation, le composant devait compenser par un router.refresh().
  revalidatePath('/crm/pipeline');
}

/** Archive (suppression douce) : la relance disparaît des listes actives mais reste
 *  consultable et restaurable dans les Archives. */
export async function archiveRelance(id: string): Promise<void> {
  await requireCrmUser();
  const supabase = await createCrmClient();
  const { error } = await supabase
    .from('relances')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) dbFail(error, 'Archivage de la relance impossible');
  revalidatePath('/crm/relances');
}

/** Restaure une relance archivée (la remet dans les listes actives). */
export async function restoreRelance(id: string): Promise<void> {
  await requireCrmUser();
  const supabase = await createCrmClient();
  const { error } = await supabase
    .from('relances')
    .update({ archived_at: null })
    .eq('id', id);
  if (error) dbFail(error, 'Restauration de la relance impossible');
  revalidatePath('/crm/relances');
}

/** Suppression définitive (irréversible) - utilisée depuis la vue Archives. */
export async function deleteRelance(id: string): Promise<void> {
  await requireCrmUser();
  const supabase = await createCrmClient();
  const { error } = await supabase.from('relances').delete().eq('id', id);
  if (error) dbFail(error, 'Suppression de la relance impossible');
  revalidatePath('/crm/relances');
}
