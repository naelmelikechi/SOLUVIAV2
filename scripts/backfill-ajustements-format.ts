/**
 * Backfill : ré-execute detectNpecChangeAjustement sur chaque ajustement
 * pending afin de réécrire le `detail` au nouveau format (groupé par jalon,
 * avec credits_existing et previous_resolved).
 *
 * Pre-requis : SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL en env.
 *
 * Usage : npx tsx scripts/backfill-ajustements-format.ts [--dry]
 *
 * Idempotent : si NPEC inchangé depuis le pending d'origine, la detection
 * réécrit le delta avec les nouvelles règles (groupage jalon, credits, taux
 * snapshot).
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import {
  detectNpecChangeAjustement,
  detectRuptureAjustement,
} from '../lib/echeancier/ajustements';

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
  const { data: pendings, error } = await supabase
    .from('facturation_ajustements_pending')
    .select(
      'id, contrat_id, type, delta_ht, contrats!inner(id, npec_amount, date_fin)',
    )
    .is('resolved_at', null);

  if (error) {
    console.error('Load pending failed:', error);
    process.exit(1);
  }
  if (!pendings || pendings.length === 0) {
    console.log('Aucun pending a backfiller.');
    return;
  }

  console.log(`${pendings.length} pending(s) trouve(s)`);
  if (DRY) {
    for (const p of pendings) {
      const c = p.contrats as { npec_amount: number; date_fin: string | null };
      console.log(
        `[DRY] pending ${p.id} type=${p.type} contrat=${p.contrat_id} npec=${c.npec_amount} oldDelta=${p.delta_ht}`,
      );
    }
    return;
  }

  for (const p of pendings) {
    const c = p.contrats as {
      id: string;
      npec_amount: number;
      date_fin: string | null;
    };
    try {
      if (p.type === 'npec_change') {
        const newDelta = await detectNpecChangeAjustement(
          supabase,
          p.contrat_id!,
          Number(c.npec_amount ?? 0),
        );
        console.log(
          `npec_change ${p.id} : ${p.delta_ht} -> ${newDelta.toFixed(2)}`,
        );
      } else if (p.type === 'rupture') {
        const dateRupture = c.date_fin ?? new Date().toISOString().slice(0, 10);
        const newDelta = await detectRuptureAjustement(
          supabase,
          p.contrat_id!,
          dateRupture,
        );
        console.log(
          `rupture     ${p.id} : ${p.delta_ht} -> ${newDelta.toFixed(2)}`,
        );
      }
    } catch (err) {
      console.error(`Erreur sur ${p.id}:`, err);
    }
  }

  console.log('Backfill termine.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
