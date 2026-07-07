'use server';
import { revalidatePath } from 'next/cache';
import { createCrmClient } from '@/lib/crm/supabase/server';
import { requireCrmUser } from '@/lib/crm/auth/roles';
import { isHiddenEmail } from '@/lib/crm/auth/hidden';
import { dbFail } from '@/lib/crm/actions/errors';
import {
  listAllActivites,
  type DashboardActivite,
} from '@/lib/crm/queries/dashboard';
import {
  createNotifications,
  excerpt,
  actorName,
} from '@/lib/crm/notifications/notify';

/** Charge toute l'activité (chargement à la demande pour la modale « Voir tout »). */
export async function loadAllActivites(): Promise<DashboardActivite[]> {
  await requireCrmUser();
  return listAllActivites();
}

export async function addNote(
  opportuniteId: string,
  contenu: string,
  mentionedIds: string[] = [],
): Promise<void> {
  const user = await requireCrmUser();
  if (!contenu.trim()) return;
  // Compte fantôme : aucune note enregistrée, aucune mention envoyée (zéro trace).
  // Garde serveur ; l'UI masque déjà le champ de saisie pour ces comptes.
  if (isHiddenEmail(user.email)) return;
  const supabase = await createCrmClient();
  const { error } = await supabase
    .from('activites')
    .insert({
      type: 'note',
      opportunite_id: opportuniteId,
      auteur_id: user.id,
      contenu,
    });
  if (error) dbFail(error, 'Ajout de la note impossible');

  // Notifs @mention (best-effort) : un destinataire distinct par id mentionné,
  // jamais soi-même. La liste source (commercialOptions) exclut déjà les fantômes.
  const cibles = [...new Set(mentionedIds)].filter(
    (id) => id && id !== user.id,
  );
  if (cibles.length > 0) {
    const auteurNom = await actorName(supabase, user);
    await createNotifications(
      supabase,
      cibles.map((uid) => ({
        user_id: uid,
        actor_id: user.id,
        type: 'mention' as const,
        contenu: `${auteurNom} vous a mentionné : ${excerpt(contenu)}`,
        link: `/crm/pipeline?opp=${opportuniteId}`,
      })),
    );
  }
  revalidatePath('/crm/pipeline');
}
