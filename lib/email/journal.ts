import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';

const SCOPE = 'email.journal';

export interface JournaliserEmailParams {
  sujet: string;
  destinataires: string[];
  expediteur?: string;
  /** Renseigne quand l'appelant connait le projet (facture, devis...). */
  projetId?: string;
  /** Renseigne quand seul le client est connu (relance globale, etc.). */
  clientId?: string;
  /** Type fonctionnel : facture, avoir, devis, relance, notification... */
  type?: string;
  statut?: string;
}

/**
 * Ecrit une ligne dans emails_envoyes pour un envoi source='app'.
 *
 * Ne leve JAMAIS et ne bloque JAMAIS l'appelant : un email qui part vaut
 * plus qu'une ligne de log. Toute erreur (table inaccessible, RLS, client
 * admin non configure) se degrade en simple logger.warn, exactement comme
 * email_send_log (cf. lib/email/send-log.ts).
 *
 * Rattachement : quand seul clientId est connu (projetId absent), la ligne
 * garde projet_id = null et apparait alors sur TOUS les projets de ce
 * client dans getEmailsByProjetId -- c'est le comportement voulu, pas un
 * defaut : un mail non rattache a un projet precis reste visible plutot
 * que d'etre perdu.
 */
export async function journaliserEmail(
  params: JournaliserEmailParams,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('emails_envoyes').insert({
      source: 'app',
      envoye_le: new Date().toISOString(),
      sujet: params.sujet,
      expediteur: params.expediteur ?? null,
      destinataires: params.destinataires,
      type: params.type ?? null,
      projet_id: params.projetId ?? null,
      client_id: params.clientId ?? null,
      statut: params.statut ?? null,
    });
    if (error) {
      logger.warn(SCOPE, 'echec ecriture emails_envoyes', {
        sujet: params.sujet,
        error,
      });
    }
  } catch (error) {
    logger.warn(SCOPE, 'echec ecriture emails_envoyes', {
      sujet: params.sujet,
      error,
    });
  }
}
