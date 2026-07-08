import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { waitForDb } from '@/lib/supabase/db-wake';
import { syncAllEduviaClients } from '@/lib/eduvia/sync';
import {
  notifyAuditAnomalies,
  type AuditAnomaly,
} from '@/lib/eduvia/audit-notify';
import { logger } from '@/lib/utils/logger';
import { TAUX_COMMISSION_DEFAUT } from '@/lib/utils/commission';

export const maxDuration = 300;

/**
 * CRON nocturne : sync complet Eduvia + audit cohérence DB.
 * Détecte les anomalies suivantes après sync :
 *   - contrats avec contract_state='ACTIVE' mais date_fin < today
 *   - contrats en DB sans projet_id (FK orpheline)
 *   - contrats actifs avec npec_amount = 0 ou NULL
 *   - contrats résiliés sans date_fin
 *   - clients où le ratio orphelins archivés ce run > 10% (signal API instable)
 *   - clients avec clé API active sans sync (tentée) depuis plus de 24h
 *
 * Les anomalies sont loguées (Sentry) ET notifiées in-app aux admins
 * (dédupliquées tant que la notification précédente n'est pas lue), sans
 * bloquer le sync.
 */
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const startedAt = new Date().toISOString();

  try {
    const supabase = createAdminClient();

    // Réveille l'instance (auto-pause Supavia) avant le sync nocturne minuit :
    // évite SOLUVIA-1M (erreur non-Error remontée d'un catch sur DB injoignable).
    await waitForDb(supabase);

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

    // f) Clients avec clé API Eduvia active sans sync depuis plus de 24h
    // (clé en échec permanent, rotation bloquée, ou budget temps toujours
    // épuisé avant ce client). last_synced_at = dernière TENTATIVE de sync
    // (curseur de rotation, avancé même sur échec) ; pour une clé jamais
    // tentée (NULL), on retombe sur created_at.
    const staleCutoffMs = Date.now() - 24 * 60 * 60 * 1000;
    const { data: activeKeys } = await supabase
      .from('client_api_keys')
      .select('client_id, label, last_synced_at, created_at')
      .eq('is_active', true);
    const staleKeys = (activeKeys ?? []).filter((k) => {
      const lastAttempt = new Date(k.last_synced_at ?? k.created_at).getTime();
      return Number.isFinite(lastAttempt) && lastAttempt < staleCutoffMs;
    });
    if (staleKeys.length > 0) {
      anomalies.push({
        type: 'client_sans_sync_24h',
        count: staleKeys.length,
        sample: staleKeys.slice(0, 5).map((k) => k.label ?? k.client_id),
      });
    }

    // g) Projets facturant reellement (contrat actif NPEC>0) mais restes au
    //    taux de commission par defaut : signal d'une config oubliee (un client
    //    a 40/55 % facture a 10 % sans alerte). Non bloquant, simple rappel.
    const { data: projetsTauxDefaut } = await supabase
      .from('projets')
      .select('ref, contrats!inner(id)')
      .eq('archive', false)
      .eq('est_libre', false)
      .eq('est_interne', false)
      .eq('est_absence', false)
      .eq('taux_commission', TAUX_COMMISSION_DEFAUT)
      .eq('contrats.archive', false)
      .gt('contrats.npec_amount', 0)
      .limit(200);
    const refsTauxDefaut = Array.from(
      new Set(
        (projetsTauxDefaut ?? [])
          .map((p) => p.ref)
          .filter((r): r is string => r != null),
      ),
    );
    if (refsTauxDefaut.length > 0) {
      anomalies.push({
        type: 'projets_taux_defaut',
        count: refsTauxDefaut.length,
        sample: refsTauxDefaut.slice(0, 5),
      });
    }

    let notified = 0;
    if (anomalies.length > 0) {
      logger.warn('eduvia_audit', 'Anomalies détectées au sync nocturne', {
        anomalies,
        syncErrors: syncResults.errors,
      });
      ({ notified } = await notifyAuditAnomalies(supabase, anomalies));
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
        admins_notified: notified,
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
