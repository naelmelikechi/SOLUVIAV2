'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createOdooClient } from '@/lib/odoo/client';
import type { OdooPingResult } from '@/lib/odoo/client';
import { syncOdoo } from '@/lib/odoo/sync';
import type { OdooSyncResult } from '@/lib/odoo/sync';
import { syncAllEduviaClients } from '@/lib/eduvia/sync';
import type { SyncResult } from '@/lib/eduvia/sync';
import { getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import type { Json } from '@/types/database';

export async function pingOdoo(): Promise<{
  success: boolean;
  result?: OdooPingResult;
  error?: string;
}> {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user.role)) {
      return { success: false, error: 'Non autorisé' };
    }
    const odoo = createOdooClient();
    const result = await odoo.ping();
    return { success: result.ok, result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('actions.sync', 'pingOdoo failed', { error: err });
    return { success: false, error: msg };
  }
}

export async function triggerOdooSync(): Promise<{
  success: boolean;
  results?: OdooSyncResult;
  error?: string;
}> {
  try {
    // Only admins can trigger manual sync
    const user = await getCurrentUser();
    if (!user || !isAdmin(user.role)) {
      return { success: false, error: 'Non autorisé' };
    }

    const supabase = createAdminClient();
    const results = await syncOdoo(supabase);

    logAudit(
      'sync_odoo',
      'system',
      undefined,
      results as unknown as Record<string, Json>,
    );

    return { success: true, results };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('actions.sync', 'triggerOdooSync failed', { error: err });
    return { success: false, error: msg };
  }
}

/**
 * Server action: trigger a manual Eduvia sync.
 * Only callable by admin users.
 */
export async function triggerEduviaSync(): Promise<{
  success: boolean;
  results?: SyncResult;
  error?: string;
}> {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user.role)) {
      return { success: false, error: 'Non autorisé' };
    }

    const supabase = createAdminClient();
    const results = await syncAllEduviaClients(supabase);

    logAudit(
      'sync_eduvia',
      'system',
      undefined,
      results as unknown as Record<string, Json>,
    );

    return { success: true, results };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('actions.sync', 'triggerEduviaSync failed', { error: err });
    return { success: false, error: msg };
  }
}
