/**
 * One-shot Odoo sync. Charge .env.local et appelle syncOdoo.
 * Sert pour le re-push des factures HEOL vers wisemanh apres bascule.
 *
 * Run : npx tsx scripts/sync-odoo-once.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { syncOdoo } = await import('@/lib/odoo/sync');

  console.log('=== ODOO sync one-shot ===');
  console.log(`Target : ${process.env.ODOO_URL} (db=${process.env.ODOO_DB})`);

  const supabase = createAdminClient();
  const result = await syncOdoo(supabase);
  console.log(JSON.stringify(result, null, 2));

  if (result.errors.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
