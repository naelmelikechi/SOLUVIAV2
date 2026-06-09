import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { logger } from '@/lib/utils/logger';

// Anomalies produites par le cron d'audit nocturne (app/api/cron/eduvia-audit).
export interface AuditAnomaly {
  type:
    | 'contract_state_actif_date_fin_passee'
    | 'contrats_sans_projet'
    | 'npec_zero_actif'
    | 'rupture_sans_date_fin'
    | 'orphan_resync_warning';
  count: number;
  sample?: string[];
}

const TITRE = 'Audit Eduvia : anomalies détectées';

const ANOMALY_LABELS: Record<AuditAnomaly['type'], string> = {
  contract_state_actif_date_fin_passee:
    'contrat(s) actif(s) avec date de fin passée',
  contrats_sans_projet: 'contrat(s) sans projet rattaché',
  npec_zero_actif: 'contrat(s) actif(s) avec NPEC nul ou manquant',
  rupture_sans_date_fin: 'contrat(s) résilié(s) sans date de fin',
  orphan_resync_warning:
    'contrat(s) orphelin(s) archivé(s) en masse (API instable ?)',
};

export function formatAnomaliesMessage(anomalies: AuditAnomaly[]): string {
  const lines = anomalies.map((a) => {
    const label = ANOMALY_LABELS[a.type] ?? a.type;
    const sample =
      a.sample && a.sample.length > 0
        ? ` (ex: ${a.sample.slice(0, 3).join(', ')})`
        : '';
    return `- ${a.count} ${label}${sample}`;
  });
  return `L'audit nocturne Eduvia a détecté :\n${lines.join('\n')}`;
}

/**
 * Notifie les admins/superadmins actifs des anomalies d'audit (in-app).
 *
 * Dédup : un admin qui a déjà cette notification NON LUE n'est pas re-notifié
 * (l'audit tourne chaque nuit ; sans ça, une anomalie persistante créerait une
 * notification par jour). Dès qu'il la lit, le prochain run avec anomalies le
 * re-notifie.
 *
 * Best-effort : ne throw jamais (l'audit ne doit pas échouer à cause de la
 * notification).
 */
export async function notifyAuditAnomalies(
  supabase: SupabaseClient<Database>,
  anomalies: AuditAnomaly[],
): Promise<{ notified: number }> {
  if (anomalies.length === 0) return { notified: 0 };

  try {
    const { data: admins, error: adminsError } = await supabase
      .from('users')
      .select('id')
      .in('role', ['admin', 'superadmin'])
      .eq('actif', true);
    if (adminsError) {
      logger.warn('eduvia_audit', 'notifyAuditAnomalies: lecture admins KO', {
        error: adminsError.message,
      });
      return { notified: 0 };
    }
    if (!admins || admins.length === 0) return { notified: 0 };

    const { data: unread } = await supabase
      .from('notifications')
      .select('user_id')
      .eq('type', 'erreur_sync')
      .eq('titre', TITRE)
      .is('read_at', null);
    const alreadyNotified = new Set((unread ?? []).map((n) => n.user_id));

    const targets = admins.filter((a) => !alreadyNotified.has(a.id));
    if (targets.length === 0) return { notified: 0 };

    const message = formatAnomaliesMessage(anomalies).slice(0, 1500);
    const { error: insertError } = await supabase.from('notifications').insert(
      targets.map((a) => ({
        type: 'erreur_sync' as const,
        user_id: a.id,
        titre: TITRE,
        message,
        lien: null,
      })),
    );
    if (insertError) {
      logger.warn('eduvia_audit', 'notifyAuditAnomalies: insert KO', {
        error: insertError.message,
      });
      return { notified: 0 };
    }
    return { notified: targets.length };
  } catch (err) {
    logger.warn('eduvia_audit', 'notifyAuditAnomalies threw', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { notified: 0 };
  }
}
