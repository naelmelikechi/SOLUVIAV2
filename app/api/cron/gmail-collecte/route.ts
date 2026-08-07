import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import {
  gmailConfigured,
  listMessageIds,
  getMessageMetadata,
} from '@/lib/gmail/client';
import { rattacherMessage } from '@/lib/gmail/collecte';
import { purgerJournalMails } from '@/lib/email/retention';

export const maxDuration = 120;

const SCOPE = 'cron.gmail-collecte';

/**
 * CRON quotidien : collecte les metadonnees (jamais le corps) des echanges
 * Gmail entre les CDP et les clients connus, pour le bloc Suivi de la fiche
 * projet. Voir docs/runbooks/gmail-collecte.md pour l'activation.
 *
 * INERTE PAR DEFAUT. Lire la boite d'un salarie est un traitement de
 * donnees personnelles : activer cette collecte sans l'autorisation du
 * super-admin Workspace et sans avoir informe l'equipe par ecrit est
 * juridiquement attaquable en France. Ce n'est pas une commodite de dev.
 */
export async function GET(request: Request) {
  // L'auth d'abord : repondre l'etat de la configuration a un appelant non
  // authentifie divulguerait inutilement si la collecte est active ou non.
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  // Purge du journal AVANT l'interrupteur de collecte, et c'est delibere.
  //
  // La retention s'applique aux deux sources de emails_envoyes ('app' et
  // 'gmail'), y compris quand la collecte Gmail est inactive : la source
  // 'app' alimente la table en permanence via lib/email/_send.ts, et son
  // journal doit s'effacer avec le temps comme celui de l'autre source.
  //
  // Purger notre propre table n'est pas lire une boite : la promesse
  // d'inertie porte sur Gmail, pas sur nos propres donnees. Placer la purge
  // apres l'interrupteur aurait laisse le journal grossir indefiniment tant
  // que la collecte n'est pas activee, c'est-a-dire exactement dans l'etat ou
  // se trouve la production aujourd'hui.
  const supabase = createAdminClient();
  const purges = await purgerJournalMails(supabase);

  // Puis l'interrupteur, avant toute lecture Gmail et tout appel reseau. Ne
  // pas deplacer ce check plus bas dans la fonction : c'est lui qui garantit
  // qu'aucune boite n'est lue tant que l'activation n'est pas deliberee.
  if (env.GMAIL_COLLECTE_ACTIVE !== 'true') {
    return NextResponse.json({
      success: true,
      actif: false,
      collectes: 0,
      purges,
    });
  }

  if (!gmailConfigured()) {
    logger.error(
      SCOPE,
      'GMAIL_COLLECTE_ACTIVE=true mais GMAIL_SERVICE_ACCOUNT_JSON ou GMAIL_DOMAINE manquant',
    );
    return NextResponse.json(
      { success: false, error: 'Configuration Gmail incomplete' },
      { status: 500 },
    );
  }

  const domaine = env.GMAIL_DOMAINE as string;

  try {
    // 1. CDP actifs du domaine Workspace -- ce sont les seules boites que le
    // compte de service est autorise a lire (delegation a l'echelle du
    // domaine, cf. lib/gmail/client.ts::assertAdresseDansDomaine).
    const { data: cdps, error: cdpsError } = await supabase
      .from('users')
      .select('email')
      .eq('role', 'cdp')
      .eq('actif', true)
      .ilike('email', `%@${domaine}`);

    if (cdpsError) {
      logger.error(SCOPE, 'chargement CDP echoue', { error: cdpsError });
      return NextResponse.json(
        { success: false, error: 'Chargement des CDP echoue' },
        { status: 500 },
      );
    }

    // 2. Annuaire client_contacts.email -> client_id : seul perimetre de
    // rattachement autorise. Un echange avec une adresse absente de cet
    // annuaire n'est stocke nulle part (cf. lib/gmail/collecte.ts).
    const { data: contacts, error: contactsError } = await supabase
      .from('client_contacts')
      .select('email, client_id')
      .not('email', 'is', null);

    if (contactsError) {
      logger.error(SCOPE, 'chargement contacts echoue', {
        error: contactsError,
      });
      return NextResponse.json(
        { success: false, error: 'Chargement des contacts echoue' },
        { status: 500 },
      );
    }

    const contactsParEmail = new Map<string, string>();
    for (const c of contacts ?? []) {
      if (c.email) contactsParEmail.set(c.email.toLowerCase(), c.client_id);
    }

    if (contactsParEmail.size === 0 || (cdps ?? []).length === 0) {
      return NextResponse.json({
        success: true,
        actif: true,
        collectes: 0,
        message: 'Aucun CDP ou aucun contact client a rapprocher',
      });
    }

    // Requete Gmail restreinte aux adresses connues : jamais un balayage
    // integral de la boite.
    const adresses = [...contactsParEmail.keys()];
    const query = adresses.map((a) => `(from:${a} OR to:${a})`).join(' OR ');

    let collectes = 0;
    let ambigus = 0;
    // Uniquement les colonnes reelles de emails_envoyes : `ambigu` est un
    // signal de journalisation (cf. lib/gmail/collecte.ts), pas une colonne.
    const lignes: {
      source: 'gmail';
      envoye_le: string;
      sujet: string;
      expediteur: string | null;
      destinataires: string[];
      client_id: string;
      external_id: string;
    }[] = [];

    for (const cdp of cdps ?? []) {
      if (!cdp.email) continue;
      // oxlint-disable-next-line react-doctor/async-await-in-loop
      const ids = await listMessageIds(cdp.email, query, 50);
      for (const id of ids) {
        // oxlint-disable-next-line react-doctor/async-await-in-loop
        const entetes = await getMessageMetadata(cdp.email, id);
        if (!entetes) continue;
        const ligne = rattacherMessage(entetes, contactsParEmail);
        if (!ligne) continue;
        if (ligne.ambigu) {
          ambigus += 1;
          logger.warn(SCOPE, 'message rattache a plusieurs clients connus', {
            messageId: id,
          });
        }
        const { ambigu: _ambigu, ...row } = ligne;
        lignes.push(row);
      }
    }

    if (lignes.length > 0) {
      const { error: upsertError, count } = await supabase
        .from('emails_envoyes')
        .upsert(lignes, {
          onConflict: 'external_id',
          ignoreDuplicates: true,
          count: 'exact',
        });
      if (upsertError) {
        logger.error(SCOPE, 'upsert emails_envoyes echoue', {
          error: upsertError,
        });
        return NextResponse.json(
          { success: false, error: 'Ecriture du journal echouee' },
          { status: 500 },
        );
      }
      collectes = count ?? 0;
    }

    logger.info(SCOPE, 'collecte gmail terminee', { collectes, ambigus });
    return NextResponse.json({ success: true, actif: true, collectes, purges });
  } catch (err) {
    logger.error(SCOPE, 'cron gmail-collecte failed', { error: err });
    return NextResponse.json(
      { success: false, error: 'Erreur lors de la collecte Gmail' },
      { status: 500 },
    );
  }
}
