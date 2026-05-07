import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { Json } from '@/types/database';

/**
 * Insert an entry in audit_logs.
 *
 * Si `userId` est fourni : aucune round-trip auth supplementaire (a privilegier
 * dans les actions qui ont deja appele requireUser/requireAdmin et ont l'user
 * en scope - cas typique apres le refactor I6).
 *
 * Si `userId` est omis : appelle auth.getUser() en fallback (legacy callers).
 * A retirer une fois tous les callers migres.
 */
export async function logAudit(
  action: string,
  entityType: string,
  entityId?: string,
  details?: Record<string, Json>,
  userId?: string,
) {
  try {
    const supabase = await createClient();

    let resolvedUserId: string | undefined = userId;
    if (!resolvedUserId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      resolvedUserId = user.id;
    }

    await supabase.from('audit_logs').insert({
      user_id: resolvedUserId,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      details: (details as Json) ?? null,
    });
  } catch (err) {
    // Audit logging should never break the main flow
    logger.error('audit', 'logAudit failed', {
      action,
      entityType,
      entityId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
