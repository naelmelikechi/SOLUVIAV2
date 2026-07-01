import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/logger';

const SCOPE = 'odoo.sync-log';

/**
 * Ecrit une ligne dans odoo_sync_logs (journal d'audit des syncs Odoo).
 *
 * Partage entre le cron (lib/odoo/sync.ts) et le webhook move-cancelled : les
 * deux chemins ecrivent des lignes cancellation par move avec le meme contrat
 * (entity_type, entity_id, statut), ce qui alimente la dedup des notifs
 * d'annulation. Best-effort : un echec d'ecriture du log est loggue mais ne
 * fait jamais echouer l'appelant.
 */
export async function logSync(
  supabase: SupabaseClient,
  opts: {
    direction: 'push' | 'pull';
    entity_type: string;
    entity_id?: string;
    statut: 'success' | 'error' | 'retry' | 'partial';
    payload?: unknown;
    erreur?: string;
  },
) {
  const { error } = await supabase.from('odoo_sync_logs').insert({
    direction: opts.direction,
    entity_type: opts.entity_type,
    entity_id: opts.entity_id ?? null,
    statut: opts.statut,
    payload: opts.payload ?? null,
    erreur: opts.erreur ?? null,
  });
  if (error) {
    logger.error(SCOPE, 'Failed to write sync log', { error });
  }
}
