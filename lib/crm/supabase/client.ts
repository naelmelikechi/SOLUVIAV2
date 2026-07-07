import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/crm/database.types';

// Client Supabase navigateur scopé au schéma `crm` (kanban Realtime).
export function createCrmBrowserClient() {
  return createBrowserClient<Database, 'crm'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: 'crm' } },
  );
}
