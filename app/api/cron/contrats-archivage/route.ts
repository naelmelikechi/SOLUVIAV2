import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import {
  contratsAArchiver,
  type ContratArchivable,
  type RegleArchivage,
} from '@/lib/contrats/archivage';

export const maxDuration = 60;

const SCOPE = 'cron.contrats-archivage';

/** Taille des lots d'identifiants passes a `.in()` (limite d'URL PostgREST). */
const LOT_IDS = 200;

/**
 * CRON quotidien : sort de la production les contrats restes trop longtemps
 * dans un etat sans issue, selon les regles de `contrats_regles_archivage`
 * (editables dans /admin/parametres, donc ajustables sans redeploiement).
 *
 * Chaque contrat archive garde la trace de la regle qui l'a sorti
 * (archive_regle_id, archive_auto_le) : sans cela il serait indiscernable d'un
 * archivage manuel, et personne ne pourrait repondre a "pourquoi celui-la a
 * disparu de ma production ?".
 */
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const [reglesRes, contratsRes] = await Promise.all([
      supabase
        .from('contrats_regles_archivage')
        .select('id, nom, etat_source, delai_jours, actif')
        .eq('actif', true),
      supabase
        .from('contrats')
        .select('id, contract_state, archive, contract_state_changed_at')
        .eq('archive', false),
    ]);

    const regles = (reglesRes.data ?? []) as RegleArchivage[];
    if (regles.length === 0) {
      return NextResponse.json({
        success: true,
        archives: 0,
        message: 'Aucune regle active',
      });
    }

    const contrats: ContratArchivable[] = (contratsRes.data ?? []).map((c) => {
      const row = c as {
        id: string;
        contract_state: string | null;
        archive: boolean;
        contract_state_changed_at: string | null;
      };
      return {
        id: row.id,
        contract_state: row.contract_state,
        archive: row.archive,
        contract_state_changed_at: row.contract_state_changed_at,
        // Renseigne au second passage, une fois les candidats connus.
        aDesFacturesEmises: false,
      };
    });

    const aujourdHui = new Date().toISOString().slice(0, 10);

    // Deux passages a dessein. Le premier donne les candidats a partir des
    // seules regles ; le second applique le garde-fou "jamais un contrat
    // portant une facture emise".
    //
    // On interroge facture_lignes APRES avoir les candidats, filtree sur leurs
    // seuls identifiants. Charger toute la table sans pagination exposait le
    // garde-fou a une troncature silencieuse (max_rows PostgREST) : au-dela du
    // seuil, un contrat deja facture serait sorti de la production, sur une
    // numerotation gapless qu'on ne peut pas corriger apres coup. L'ensemble
    // est desormais borne par le nombre de candidats, pas par le volume total
    // de lignes de facture.
    const candidats = contratsAArchiver(contrats, regles, aujourdHui);

    if (candidats.length === 0) {
      return NextResponse.json({
        success: true,
        archives: 0,
        message: 'Aucun contrat a archiver',
      });
    }

    const idsCandidats = candidats.map((d) => d.contratId);
    const contratsFactures = new Set<string>();

    // Decoupage : `.in()` passe par l'URL, une liste illimitee finirait par
    // depasser la taille de requete acceptee par PostgREST.
    for (let i = 0; i < idsCandidats.length; i += LOT_IDS) {
      const lot = idsCandidats.slice(i, i + LOT_IDS);
      // Les brouillons (a_emettre) ne comptent pas, ils ne sont pas encore
      // des recettes. Jointure verifiee en base locale :
      // facture_lignes.contrat_id -> contrats.id (idx_facture_lignes_contrat).
      // oxlint-disable-next-line react-doctor/async-await-in-loop
      const { data, error } = await supabase
        .from('facture_lignes')
        .select('contrat_id, facture:factures!inner(statut)')
        .in('contrat_id', lot)
        .neq('facture.statut', 'a_emettre');

      if (error) {
        // On n'archive RIEN : sans cette liste, le garde-fou ne tient plus.
        // Mieux vaut ne rien faire qu'archiver a l'aveugle.
        logger.error(SCOPE, 'lecture facture_lignes echouee, aucun archivage', {
          error,
        });
        return NextResponse.json(
          {
            success: false,
            archives: 0,
            error: 'Garde-fou facturation indisponible - aucun archivage',
          },
          { status: 500 },
        );
      }

      for (const ligne of data ?? []) {
        const id = (ligne as { contrat_id: string | null }).contrat_id;
        if (id != null) contratsFactures.add(id);
      }
    }

    const decisions = contratsAArchiver(
      contrats.map((c) => ({
        ...c,
        aDesFacturesEmises: contratsFactures.has(c.id),
      })),
      regles,
      aujourdHui,
    );

    if (decisions.length === 0) {
      return NextResponse.json({
        success: true,
        archives: 0,
        message: 'Aucun contrat a archiver',
      });
    }

    // Une mise a jour par regle : les contrats d'une meme regle partagent
    // archive_regle_id, on evite un aller-retour par contrat.
    let archives = 0;
    const parRegle = new Map<string, string[]>();
    for (const d of decisions) {
      const liste = parRegle.get(d.regleId) ?? [];
      liste.push(d.contratId);
      parRegle.set(d.regleId, liste);
    }

    for (const [regleId, ids] of parRegle) {
      const { error } = await supabase
        .from('contrats')
        .update({
          archive: true,
          archive_auto_le: new Date().toISOString(),
          archive_regle_id: regleId,
        })
        .in('id', ids);

      if (error) {
        logger.error(SCOPE, 'archivage failed', { regleId, error });
        continue;
      }
      archives += ids.length;
    }

    logger.info(SCOPE, 'contrats archives', {
      archives,
      decisions: decisions.length,
    });

    return NextResponse.json({
      success: true,
      archives,
      detail: decisions.map((d) => ({
        contratId: d.contratId,
        regle: d.regleNom,
        joursDansEtat: d.joursDansEtat,
      })),
    });
  } catch (err) {
    logger.error(SCOPE, 'cron failed', { error: err });
    return NextResponse.json(
      { success: false, error: 'Erreur lors de archivage' },
      { status: 500 },
    );
  }
}
