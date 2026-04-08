import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// Service role client for CRON jobs and admin operations
// Bypasses RLS -- use only in server-side CRON routes
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
