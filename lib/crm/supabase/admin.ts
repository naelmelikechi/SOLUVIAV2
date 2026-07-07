import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import type { Database } from '@/lib/crm/database.types';

// Client service_role scopé au schéma `crm`. Contourne la RLS : à n'utiliser que
// côté serveur (routes CRON, recaps). Aucun cookie / aucune session.
export function createCrmAdminClient() {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for CRM admin operations',
    );
  }
  return createClient<Database, 'crm'>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: 'crm' } },
  );
}
