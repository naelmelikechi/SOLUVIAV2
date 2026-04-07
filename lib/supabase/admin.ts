import { createClient } from '@supabase/supabase-js';

// Service role client for CRON jobs and admin operations
// Bypasses RLS -- use only in server-side CRON routes
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
