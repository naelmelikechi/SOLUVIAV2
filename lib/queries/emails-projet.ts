import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';

/**
 * Les 20 derniers mails d'un projet, toutes sources confondues (app + gmail).
 *
 * Rattachement : un mail est vu sur ce projet soit qu'il lui soit
 * directement rattache (`projet_id = projetId`), soit qu'il ne soit
 * rattache qu'au client (`projet_id IS NULL AND client_id = clientId`) --
 * cas d'un envoi qui ne connaissait que le client (relance globale, etc.),
 * cf. lib/email/journal.ts. Un mail apparait alors sur tous les projets de
 * ce client.
 */
export async function getEmailsByProjetId(projetId: string, clientId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('emails_envoyes')
    .select(
      'id, source, envoye_le, sujet, destinataires, type, statut, projet_id, client_id',
    )
    .or(
      `projet_id.eq.${projetId},and(projet_id.is.null,client_id.eq.${clientId})`,
    )
    .order('envoye_le', { ascending: false })
    .limit(20);

  if (error) {
    logger.error('queries.emails-projet', 'getEmailsByProjetId failed', {
      projetId,
      clientId,
      error,
    });
    throw new AppError(
      'EMAILS_PROJET_FETCH_FAILED',
      'Impossible de charger les mails du projet',
      { cause: error },
    );
  }
  return data;
}

export type ProjetEmail = Awaited<
  ReturnType<typeof getEmailsByProjetId>
>[number];
