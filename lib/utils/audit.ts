import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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
    let resolvedUserId: string | undefined = userId;
    if (!resolvedUserId) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      resolvedUserId = user.id;
    }

    // audit_logs INSERT est restreint en RLS aux admin/superadmin, mais des
    // actions auditées sont exécutées par des non-admins (CDP/commercial :
    // mot de passe, absences, idées, prospects...). Écrire via le client
    // service-role garantit qu'aucune trace n'est perdue silencieusement, sans
    // ouvrir audit_logs en écriture aux rôles non-admin (concern système).
    const admin = createAdminClient();
    const { error } = await admin.from('audit_logs').insert({
      user_id: resolvedUserId,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      details: (details as Json) ?? null,
    });
    if (error) {
      logger.error('audit', 'audit insert rejected', {
        action,
        entityType,
        entityId,
        error: error.message,
      });
    }
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
