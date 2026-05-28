import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { Json } from '@/types/database';

/**
 * Insert an entry in audit_logs.
 *
 * Si `userId` est fourni : aucune round-trip auth supplementaire (a privilegier
 * dans les actions qui ont deja appele requireAuth/checkAuth et ont l'user
 * en scope - cas typique apres le refactor I6).
 *
 * Si `userId` est omis : appelle auth.getUser() en fallback (legacy callers).
 *
 * Auto-defere via Next.js `after()` : la Server Action renvoie immediatement
 * sa reponse, et Vercel attend tout de meme la fin de l'INSERT avant de tear
 * down la fonction. Les callsites N'ONT PAS a await ni a wrapper - la fonction
 * est fire-safe par design. En dehors d'un request scope (tests vitest, CRON
 * standalone), on retombe sur un INSERT direct (best-effort, void promise).
 */
async function doInsert(
  action: string,
  entityType: string,
  entityId: string | undefined,
  details: Record<string, Json> | undefined,
  userId: string | undefined,
): Promise<void> {
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

export function logAudit(
  action: string,
  entityType: string,
  entityId?: string,
  details?: Record<string, Json>,
  userId?: string,
): void {
  try {
    after(() => doInsert(action, entityType, entityId, details, userId));
  } catch {
    // `after()` throws "outside a request scope" : tests, CRON standalone,
    // edge runtimes sans support. On bascule en best-effort void promise -
    // la pile de tests / le runtime de cron drainent les promesses pendantes.
    void doInsert(action, entityType, entityId, details, userId);
  }
}
