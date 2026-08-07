import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { logger } from '@/lib/utils/logger';

const SCOPE = 'email.retention';

/**
 * Retention par defaut du journal `emails_envoyes`, en mois. Sert de repli si
 * le parametre `suivi.retention_emails_mois` est absent, vide ou invalide : un
 * parametre mal saisi ne doit ni desactiver la purge (le journal grossirait
 * indefiniment) ni la rendre destructrice (une valeur nulle effacerait tout).
 */
export const DEFAUT_RETENTION_EMAILS_MOIS = 24;

/**
 * Date limite de conservation : tout ce qui est anterieur est purgeable.
 * Fonction pure, testable sans base.
 */
export function dateLimiteRetention(
  retentionMois: number,
  maintenant: Date = new Date(),
): string {
  const limite = new Date(maintenant.getTime());
  limite.setUTCMonth(limite.getUTCMonth() - retentionMois);
  return limite.toISOString();
}

/** Normalise la valeur brute du parametre. */
export function parseRetentionMois(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === '') return DEFAUT_RETENTION_EMAILS_MOIS;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAUT_RETENTION_EMAILS_MOIS;
}

/**
 * Supprime du journal des mails les lignes plus anciennes que la retention.
 *
 * `emails_envoyes` accumule des metadonnees issues des boites de salaries
 * (source 'gmail') et des envois de l'application (source 'app'). Sans duree
 * de conservation ni chemin d'effacement, la promesse de perimetre "reduit au
 * strict necessaire" inscrite dans la migration d'origine ne tenait pas dans
 * le temps.
 *
 * Fail-soft : un echec de purge est journalise mais ne fait pas echouer le
 * cron appelant, dont ce n'est pas la mission principale.
 *
 * @returns le nombre de lignes supprimees, 0 en cas d'echec.
 */
export async function purgerJournalMails(
  supabase: SupabaseClient<Database>,
  maintenant: Date = new Date(),
): Promise<number> {
  const { data: parametre } = await supabase
    .from('parametres')
    .select('valeur')
    .eq('cle', 'suivi.retention_emails_mois')
    .maybeSingle();

  const retentionMois = parseRetentionMois(parametre?.valeur);
  const limite = dateLimiteRetention(retentionMois, maintenant);

  const { error, count } = await supabase
    .from('emails_envoyes')
    .delete({ count: 'exact' })
    .lt('envoye_le', limite);

  if (error) {
    logger.error(SCOPE, 'purge du journal des mails echouee', {
      error,
      limite,
      retentionMois,
    });
    return 0;
  }

  const purges = count ?? 0;
  if (purges > 0) {
    logger.info(SCOPE, 'journal des mails purge', {
      purges,
      limite,
      retentionMois,
    });
  }
  return purges;
}
