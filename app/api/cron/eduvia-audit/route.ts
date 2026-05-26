import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncAllEduviaClients } from '@/lib/eduvia/sync';
import { logger } from '@/lib/utils/logger';

export const maxDuration = 300;

interface AuditAnomaly {
  type:
    | 'contract_state_actif_date_fin_passee'
    | 'contrats_sans_projet'
    | 'npec_zero_actif'
    | 'rupture_sans_date_fin'
    | 'orphan_resync_warning';
  count: number;
  sample?: string[];
}

/**
 * CRON nocturne : sync complet Eduvia + audit cohérence DB.
 * Détecte les anomalies suivantes après sync :
 *   - contrats avec contract_state='ACTIVE' mais date_fin < today
 *   - contrats en DB sans projet_id (FK orpheline)
 *   - contrats actifs avec npec_amount = 0 ou NULL
 *   - contrats résiliés sans date_fin
 *   - clients où le ratio orphelins archivés ce run > 10% (signal API instable)
 *
 * Les anomalies sont loguées (Sentry breadcrumbs) sans bloquer le sync.
 */
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const startedAt = new Date().toISOString();

  try {
    const supabase = createAdminClient();

    // Étape 1 : sync complet
    const syncResults = await syncAllEduviaClients(supabase);

    // Étape 2 : audit cohérence DB
    const anomalies: AuditAnomaly[] = [];
    const today = new Date().toISOString().slice(0, 10);

    // a) Contrats actifs avec date_fin passée
    const { data: lateContrats } = await supabase
      .from('contrats')
      .select('ref, date_fin')
      .eq('archive', false)
      .in('contract_state', ['ACTIVE', 'ENGAGE', 'actif'])
      .lt('date_fin', today)
      .limit(50);
    if (lateContrats && lateContrats.length > 0) {
      anomalies.push({
        type: 'contract_state_actif_date_fin_passee',
        count: lateContrats.length,
        sample: lateContrats
          .slice(0, 5)
          .map((c) => c.ref)
          .filter((r): r is string => r != null),
      });
    }

    // b) Contrats sans projet (FK orpheline - ne devrait jamais arriver, NOT NULL)
    const { count: noProjectCount } = await supabase
      .from('contrats')
      .select('id', { count: 'exact', head: true })
      .eq('archive', false)
      .is('projet_id', null);
    if (noProjectCount && noProjectCount > 0) {
      anomalies.push({
        type: 'contrats_sans_projet',
        count: noProjectCount,
      });
    }

    // c) Contrats actifs avec npec = 0/NULL
    const { data: zeroNpec } = await supabase
      .from('contrats')
      .select('ref')
      .eq('archive', false)
      .in('contract_state', ['ACTIVE', 'ENGAGE', 'actif'])
      .or('npec_amount.is.null,npec_amount.eq.0')
      .limit(50);
    if (zeroNpec && zeroNpec.length > 0) {
      anomalies.push({
        type: 'npec_zero_actif',
        count: zeroNpec.length,
        sample: zeroNpec
          .slice(0, 5)
          .map((c) => c.ref)
          .filter((r): r is string => r != null),
      });
    }

    // d) Contrats résiliés sans date_fin
    const { data: ruptureNoDate } = await supabase
      .from('contrats')
      .select('ref')
      .eq('archive', false)
      .in('contract_state', ['resilie', 'ANNULE'])
      .is('date_fin', null)
      .limit(50);
    if (ruptureNoDate && ruptureNoDate.length > 0) {
      anomalies.push({
        type: 'rupture_sans_date_fin',
        count: ruptureNoDate.length,
        sample: ruptureNoDate
          .slice(0, 5)
          .map((c) => c.ref)
          .filter((r): r is string => r != null),
      });
    }

    // e) Warning si > 10% orphelins archivés sur un client (signal API instable)
    for (const r of syncResults.results) {
      const total = r.contrats + r.contrats_archived_orphan;
      if (total > 0 && r.contrats_archived_orphan / total > 0.1) {
        anomalies.push({
          type: 'orphan_resync_warning',
          count: r.contrats_archived_orphan,
          sample: [
            `client=${r.clientId} (${r.contrats_archived_orphan}/${total})`,
          ],
        });
      }
    }

    if (anomalies.length > 0) {
      logger.warn('eduvia_audit', 'Anomalies détectées au sync nocturne', {
        anomalies,
        syncErrors: syncResults.errors,
      });
    } else {
      logger.info('eduvia_audit', 'Sync nocturne OK, aucune anomalie', {
        syncedClients: syncResults.syncedClients,
      });
    }

    return NextResponse.json({
      success: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      sync: syncResults,
      audit: {
        anomalies_count: anomalies.length,
        anomalies,
      },
    });
  } catch (err) {
    logger.error('eduvia_audit', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Erreur interne',
      },
      { status: 500 },
    );
  }
}
