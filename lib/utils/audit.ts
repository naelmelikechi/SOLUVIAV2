import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { Json } from '@/types/database';

export async function logAudit(
  action: string,
  entityType: string,
  entityId?: string,
  details?: Record<string, Json>,
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('audit_logs').insert({
      user_id: user.id,
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
