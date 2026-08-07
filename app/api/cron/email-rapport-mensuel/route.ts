import { NextResponse } from 'next/server';
import { format, startOfMonth, subMonths, endOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import { sendRapportMensuelEmail } from '@/lib/email/notifications';
import { withEmailLock } from '@/lib/email/send-log';
import { fetchAllRows } from '@/lib/supabase/fetch-all';
import type { AvoirsEmbed } from '@/lib/utils/avoir-netting';

/** Colonnes reellement lues du select factures ci-dessous. */
interface FactureRapportRow {
  id: string;
  montant_ht: number;
  statut: 'a_emettre' | 'emise' | 'payee' | 'en_retard' | 'avoir';
  est_avoir: boolean;
  facture_origine_id: string | null;
  date_emission: string | null;
  avoirs: AvoirsEmbed;
  client: { is_demo: boolean; archive: boolean };
}
import { encaisseHt } from '@/lib/utils/montant-ht';
import { soldeNetHt } from '@/lib/utils/avoir-netting';
import { computeContractSchedule } from '@/lib/queries/production';
import { getContratsActifs } from '@/lib/queries/production-aggregates';

export const maxDuration = 120;

// Sent on the 1st of each month to active admins: recap of the previous month.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();

  const now = new Date();
  const prevStart = startOfMonth(subMonths(now, 1));
  const prevEnd = endOfMonth(prevStart);
  const prevStartStr = format(prevStart, 'yyyy-MM-dd');
  const prevEndStr = format(prevEnd, 'yyyy-MM-dd');
  const monthKey = format(prevStart, 'yyyy-MM');
  const moisLabel = format(prevStart, 'MMMM yyyy', { locale: fr });

  try {
    const result = await withEmailLock(
      supabase,
      'email-rapport-mensuel',
      format(prevStart, 'yyyy-MM'),
      async () => {
        const [facturesRes, paiementsRes, contratsProd, adminsRes] =
          await Promise.all([
            // Exclut les clients demo/archives (memes filtres que le dashboard)
            // et les brouillons (a_emettre) : "factures emises" = reellement emises.
            // C'est la plus lourde des quatre (embed auto-referentiel `avoirs`
            // + jointure !inner sur clients). Elle etait la seule du cron a ne
            // pas passer par fetchAllRows, alors que le reste du depot le fait
            // systematiquement : au-dela de 1000 lignes elle tronquait en
            // silence, en plus du risque de statement_timeout.
            fetchAllRows<FactureRapportRow>((from, to) =>
              supabase
                .from('factures')
                .select(
                  'id, montant_ht, statut, est_avoir, facture_origine_id, date_emission, avoirs:factures!facture_origine_id(montant_ht, statut), client:clients!factures_client_id_fkey!inner(is_demo, archive)',
                )
                .gte('date_emission', prevStartStr)
                .lte('date_emission', prevEndStr)
                .neq('statut', 'a_emettre')
                .eq('client.is_demo', false)
                .eq('client.archive', false)
                .order('id')
                .range(from, to),
            ),
            supabase
              .from('paiements')
              .select(
                'montant, date_reception, facture:factures!paiements_facture_id_fkey!inner(montant_ht, montant_ttc, client:clients!factures_client_id_fkey!inner(is_demo, archive))',
              )
              .gte('date_reception', prevStartStr)
              .lte('date_reception', prevEndStr)
              .eq('facture.client.is_demo', false)
              .eq('facture.client.archive', false),
            // Production live depuis les contrats (même définition que le
            // dashboard : commission prorata durée), via le module partage
            // production-aggregates (RPC SQL fenetre = mois precedent,
            // fallback fetchAllRows) : memes filtres demo/archive.
            getContratsActifs(supabase, monthKey, monthKey, { strict: true }),
            supabase
              .from('users')
              .select('email, prenom')
              .in('role', ['admin', 'superadmin'])
              .eq('actif', true),
          ]);

        // Un select Supabase en echec ne leve pas : il resout en
        // { data: null, error }. Le `?? []` transformait donc une panne en
        // tableau vide, et le mail annoncait « 0 EUR facture, 0 facture emise »
        // pour un mois a plusieurs dizaines de milliers d'euros — avec une
        // production correcte affichee a cote, ce qui rendait l'incoherence
        // credible plutot que visible.
        //
        // Pire, le mois etait PERDU : `sent` valant admins.length, donc > 0,
        // withEmailLock ne relachait pas le verrou. La cle (mois) restait posee,
        // le mois suivant en utilise une autre, et aucune interface n'expose
        // email_send_log. Lever ici relache le verrou et rend le run rejouable.
        if (facturesRes.error) {
          throw new Error(
            `Rapport mensuel : lecture des factures en echec (${facturesRes.error.message})`,
          );
        }
        if (paiementsRes.error) {
          throw new Error(
            `Rapport mensuel : lecture des paiements en echec (${paiementsRes.error.message})`,
          );
        }
        if (adminsRes.error) {
          throw new Error(
            `Rapport mensuel : lecture des administrateurs en echec (${adminsRes.error.message})`,
          );
        }

        const factures = facturesRes.data ?? [];
        const paiements = paiementsRes.data ?? [];
        const admins = adminsRes.data;

        // Net des avoirs emis dans le mois (montants negatifs), aligne sur le
        // KPI "Facture (mois)" de /facturation. Les avoirs brouillon restent
        // exclus par le .neq('a_emettre') de la requete.
        const factureHt =
          Math.round(
            factures.reduce((s, f) => s + (f.montant_ht ?? 0), 0) * 100,
          ) / 100;

        const encaisseHtTotal =
          Math.round(
            paiements.reduce((s, p) => {
              const facture = p.facture as {
                montant_ht: number;
                montant_ttc: number;
              } | null;
              return (
                s +
                encaisseHt(
                  p.montant ?? 0,
                  facture?.montant_ht ?? 0,
                  facture?.montant_ttc ?? 0,
                )
              );
            }, 0) * 100,
          ) / 100;

        // Production du mois précédent = commission SOLUVIA (NPEC × taux, HT)
        // prorata sur la durée du contrat. Même définition que le dashboard,
        // indépendante de la facturation.
        let productionHt = 0;
        for (const c of contratsProd) {
          if (!c.date_debut || !c.duree_mois || c.duree_mois <= 0) continue;
          if (!c.npec_amount || c.npec_amount <= 0) continue;
          const schedule = computeContractSchedule(
            c.date_debut,
            c.duree_mois,
            c.npec_amount,
            c.taux_commission ?? 0,
            c.date_rupture,
          );
          for (const e of schedule.soluvia) {
            if (e.month === monthKey) productionHt += e.amount;
          }
        }
        productionHt = Math.round(productionHt * 100) / 100;

        const nbFacturesEmises = factures.filter((f) => !f.est_avoir).length;
        // Une facture totalement soldee par avoir n'est plus un retard reel.
        const nbFacturesRetard = factures.filter(
          (f) =>
            f.statut === 'en_retard' && soldeNetHt(f.montant_ht, f.avoirs) > 0,
        ).length;

        const kpis = {
          moisPrecedent: moisLabel,
          productionHt,
          factureHt,
          encaisseHt: encaisseHtTotal,
          nbFacturesEmises,
          nbFacturesRetard,
        };

        if (!admins || admins.length === 0) {
          return { sent: 0, message: 'Aucun admin actif' };
        }

        let sent = 0;
        let failed = 0;
        for (const admin of admins) {
          // oxlint-disable-next-line react-doctor/async-await-in-loop
          const r = await sendRapportMensuelEmail({
            to: admin.email,
            prenom: admin.prenom,
            kpis,
          });
          if (r.success) sent++;
          else failed++;
        }

        logger.info('cron.email-rapport-mensuel', 'Rapport envoyé', {
          sent,
          failed,
          mois: moisLabel,
        });
        return { sent, failed, kpis };
      },
    );

    if (result === null) {
      return NextResponse.json({
        success: true,
        sent: 0,
        skipped: 'already_sent',
      });
    }
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    logger.error('cron.email-rapport-mensuel', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
