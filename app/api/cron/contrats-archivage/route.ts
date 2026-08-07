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
    const [reglesRes, contratsRes, facturesRes] = await Promise.all([
      supabase
        .from('contrats_regles_archivage')
        .select('id, nom, etat_source, delai_jours, actif')
        .eq('actif', true),
      supabase
        .from('contrats')
        .select('id, contract_state, archive, contract_state_changed_at')
        .eq('archive', false),
      // Garde-fou : tout contrat porte par une ligne de facture emise est
      // hors de portee du cron. Les brouillons (a_emettre) ne comptent pas,
      // ils ne sont pas encore des recettes. Jointure verifiee en base locale :
      // facture_lignes.contrat_id -> contrats.id (index idx_facture_lignes_contrat).
      supabase
        .from('facture_lignes')
        .select('contrat_id, facture:factures!inner(statut)')
        .neq('facture.statut', 'a_emettre'),
    ]);

    const regles = (reglesRes.data ?? []) as RegleArchivage[];
    if (regles.length === 0) {
      return NextResponse.json({
        success: true,
        archives: 0,
        message: 'Aucune regle active',
      });
    }

    const contratsFactures = new Set(
      (facturesRes.data ?? [])
        .map((l) => (l as { contrat_id: string | null }).contrat_id)
        .filter((id): id is string => id != null),
    );

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
        aDesFacturesEmises: contratsFactures.has(row.id),
      };
    });

    const aujourdHui = new Date().toISOString().slice(0, 10);
    const decisions = contratsAArchiver(contrats, regles, aujourdHui);

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
