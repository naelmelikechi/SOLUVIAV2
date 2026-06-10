/**
 * Backfill : normalise les numeros de telephone existants de la table `users`
 * vers le format national espace "0X XX XX XX XX" (cf. lib/utils/fr-phone).
 *
 * Pre-requis : SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL (.env.local).
 *
 * Usage :
 *   npx tsx scripts/backfill-user-telephones.ts --dry   (lecture seule, liste)
 *   npx tsx scripts/backfill-user-telephones.ts         (applique)
 *
 * Idempotent : normalizeFrPhone est stable sur sa propre sortie, donc re-passer
 * ne change rien. Les numeros non reconnus comme FR sont laisses tels quels.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import { normalizeFrPhone } from '../lib/utils/fr-phone';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes('--dry');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (.env.local)',
  );
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, prenom, nom, telephone')
    .not('telephone', 'is', null);

  if (error) {
    console.error('Lecture users echouee :', error.message);
    process.exit(1);
  }
  if (!users || users.length === 0) {
    console.log('Aucun utilisateur avec telephone.');
    return;
  }

  const changes = users
    .map((u) => ({
      u,
      before: u.telephone,
      after: normalizeFrPhone(u.telephone),
    }))
    .filter((c) => c.after !== c.before);

  console.log(
    `${users.length} utilisateur(s) avec telephone, ${changes.length} a normaliser.`,
  );

  let applied = 0;
  for (const c of changes) {
    const label = `${c.u.prenom ?? ''} ${c.u.nom ?? ''}`.trim() || c.u.id;
    console.log(`  ${label} : "${c.before}" -> "${c.after ?? '(null)'}"`);
    if (DRY) continue;
    const { error: upErr } = await supabase
      .from('users')
      .update({ telephone: c.after })
      .eq('id', c.u.id);
    if (upErr) {
      console.error(`    echec update ${c.u.id} :`, upErr.message);
      continue;
    }
    applied++;
  }

  console.log(
    DRY
      ? 'Dry-run termine (aucune ecriture).'
      : `Backfill termine : ${applied}/${changes.length} mis a jour.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
