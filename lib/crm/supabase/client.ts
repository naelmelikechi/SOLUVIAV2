import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';
import type { Database } from '@/lib/crm/database.types';

// Client Supabase navigateur scopé au schéma `crm` (kanban Realtime).
export function createCrmBrowserClient() {
  return createBrowserClient<Database, 'crm'>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { db: { schema: 'crm' } },
  );
}
