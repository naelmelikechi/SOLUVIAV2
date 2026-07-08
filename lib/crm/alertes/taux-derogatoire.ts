import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCrmAdminClient } from '@/lib/crm/supabase/admin';
import { sendTauxDerogatoireEmail } from '@/lib/email/crm-alertes-templates';
import { SEUIL_TAUX_DEROGATOIRE } from '@/lib/crm/domain/taux';
import { getAppUrl } from '@/lib/utils/app-url';
import { logger } from '@/lib/utils/logger';

// Garde-fou taux dérogatoire (Direction 2026-06-09) : quand un taux NPEC < 35 %
// est saisi sur une opportunité CRM, la Direction (admin/superadmin actifs) est
// prévenue immédiatement : notification in-app `public.notifications` + email.
// Écritures cross-schéma via clients service-role (même approche que
// lib/crm/actions/pont.ts : la RLS `public` ne couvre pas la session commerciale).
// Best-effort : un échec de notification ne doit JAMAIS bloquer la sauvegarde.
const SCOPE = 'crm.taux-derogatoire';

export async function notifierTauxDerogatoire(p: {
  oppId: string;
  taux: number;
  saisiPar: { id: string; email?: string | null };
}): Promise<void> {
  try {
    const crm = createCrmAdminClient();
    const pub = createAdminClient();

    const { data: opp } = await crm
      .from('opportunites')
      .select('id, intitule, compte_id')
      .eq('id', p.oppId)
      .maybeSingle();
    const { data: compte } = opp
      ? await crm
          .from('comptes')
          .select('nom')
          .eq('id', opp.compte_id)
          .maybeSingle()
      : { data: null };
    const compteNom = compte?.nom ?? opp?.intitule ?? 'Compte inconnu';
    const oppIntitule = opp?.intitule ?? 'Opportunité';

    // Nom affichable de l'auteur (public.users), à défaut son email.
    const { data: auteur } = await pub
      .from('users')
      .select('prenom, nom, email')
      .eq('id', p.saisiPar.id)
      .maybeSingle();
    const saisiPar =
      [auteur?.prenom, auteur?.nom].filter(Boolean).join(' ').trim() ||
      auteur?.email ||
      p.saisiPar.email ||
      'Utilisateur inconnu';

    // Direction = admins/superadmins actifs.
    const { data: admins, error: adminsErr } = await pub
      .from('users')
      .select('id, email')
      .in('role', ['admin', 'superadmin'])
      .eq('actif', true);
    if (adminsErr) {
      logger.error(SCOPE, 'select admins failed', {
        oppId: p.oppId,
        error: adminsErr,
      });
      return;
    }
    if (!admins || admins.length === 0) return;

    // 1. Notification in-app (public.notifications) pour chaque admin.
    const { error: notifErr } = await pub.from('notifications').insert(
      admins.map((a) => ({
        user_id: a.id,
        type: 'taux_derogatoire' as const,
        titre: `Taux dérogatoire < ${SEUIL_TAUX_DEROGATOIRE} %`,
        message: `${compteNom} : taux NPEC saisi à ${p.taux} % par ${saisiPar} (seuil Direction : ${SEUIL_TAUX_DEROGATOIRE} %).`,
        lien: '/crm/pipeline',
      })),
    );
    if (notifErr) {
      logger.error(SCOPE, 'insert notifications failed', {
        oppId: p.oppId,
        error: notifErr,
      });
    }

    // 2. Email aux mêmes admins.
    const emails = admins
      .map((a) => a.email)
      .filter((e): e is string => Boolean(e));
    if (emails.length > 0) {
      const res = await sendTauxDerogatoireEmail({
        to: emails,
        compte: compteNom,
        opportunite: oppIntitule,
        taux: p.taux,
        saisiPar,
        lienPipeline: `${getAppUrl()}/crm/pipeline`,
      });
      if (!res.success && !res.skipped) {
        logger.error(SCOPE, 'email failed', {
          oppId: p.oppId,
          error: res.error,
        });
      }
    }
  } catch (err) {
    logger.error(SCOPE, 'notifierTauxDerogatoire failed', {
      oppId: p.oppId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
