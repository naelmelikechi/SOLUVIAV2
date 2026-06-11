/**
 * Resync Eduvia manuel (one-shot) — mirroir exact du cron GET /api/sync/eduvia.
 * Utilise le service-role client + syncAllEduviaClients. Idempotent.
 *
 * Usage : npx tsx scripts/eduvia-resync-once.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createAdminClient } from '@/lib/supabase/admin';
import { syncAllEduviaClients } from '@/lib/eduvia/sync';

async function main() {
  const supabase = createAdminClient();
  const results = await syncAllEduviaClients(supabase);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
