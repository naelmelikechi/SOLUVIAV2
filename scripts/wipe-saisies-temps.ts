/**
 * Wipe one-shot : supprime toutes les saisies_temps (et saisies_temps_axes
 * en cascade via FK ON DELETE CASCADE). Reset complet de l historique de
 * temps pour repartir d une app vide avant le broadcast testeurs.
 *
 * Usage :
 *   npx tsx --env-file=.env.local scripts/wipe-saisies-temps.ts
 *   npx tsx --env-file=.env.local scripts/wipe-saisies-temps.ts --confirm
 *
 * Sans --confirm, le script affiche le compte et s'arrete (dry-run).
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createAdminClient } from '@/lib/supabase/admin';

async function main() {
  const confirm = process.argv.includes('--confirm');
  const supabase = createAdminClient();

  const { count: countTemps, error: countErr } = await supabase
    .from('saisies_temps')
    .select('id', { count: 'exact', head: true });
  if (countErr) {
    console.error('Count saisies_temps failed:', countErr.message);
    process.exit(1);
  }

  const { count: countAxes, error: axesErr } = await supabase
    .from('saisies_temps_axes')
    .select('id', { count: 'exact', head: true });
  if (axesErr) {
    console.error('Count saisies_temps_axes failed:', axesErr.message);
    process.exit(1);
  }

  console.log(`saisies_temps      : ${countTemps ?? 0} lignes`);
  console.log(`saisies_temps_axes : ${countAxes ?? 0} lignes (cascade auto)`);

  if (!confirm) {
    console.log('\nDry-run. Relancer avec --confirm pour wipe.');
    process.exit(0);
  }

  if ((countTemps ?? 0) === 0) {
    console.log('\nDeja vide, rien a faire.');
    process.exit(0);
  }

  console.log('\nDelete en cours...');
  const { error: delErr } = await supabase
    .from('saisies_temps')
    .delete()
    .not('id', 'is', null);

  if (delErr) {
    console.error('Delete failed:', delErr.message);
    process.exit(1);
  }

  const { count: after } = await supabase
    .from('saisies_temps')
    .select('id', { count: 'exact', head: true });
  const { count: afterAxes } = await supabase
    .from('saisies_temps_axes')
    .select('id', { count: 'exact', head: true });

  console.log(`\nApres wipe :`);
  console.log(`  saisies_temps      : ${after ?? 0} lignes`);
  console.log(`  saisies_temps_axes : ${afterAxes ?? 0} lignes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
