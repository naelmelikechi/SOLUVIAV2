/**
 * Propose un mapping projets.code_analytique <-> comptes Odoo
 * en se basant sur la typologie du projet.
 *
 * Mapping :
 *   APP (Apprentissage)       -> 11.01.CTR.COM  Contrats Commissions (% NPEC)
 *   POE (POEI)                -> 11.02.SES.POE  Sessions POEI
 *   PDC (Plan dev compétences) -> 11.03.SES.PDC  Sessions PDC
 *   apport d'affaires manuel  -> 11.04.APP.AFF  Apport d'affaire
 *   INT (interne)             -> aucun (pas de revenu)
 *
 * Usage : npx tsx scripts/suggest-code-analytique-mapping.ts
 * Avec --apply : applique le mapping (UPDATE projets SET code_analytique).
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const APPLY = process.argv.includes('--apply');

const TYPOLOGIE_TO_CODE: Record<string, string | null> = {
  APP: '11.01.CTR.COM',
  POE: '11.02.SES.POE',
  PDC: '11.03.SES.PDC',
  INT: null,
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env.local',
    );
  }
  const supabase = createClient<Database>(url, key);

  const { data: projets, error } = await supabase
    .from('projets')
    .select(
      'id, ref, code_analytique, est_interne, client:clients!inner(raison_sociale), typologie:typologies_projet!inner(code, libelle)',
    )
    .eq('archive', false)
    .order('ref');

  if (error) throw error;

  console.log(`\n=== ${projets?.length ?? 0} projets actifs ===\n`);
  console.log(
    'REF'.padEnd(14),
    'TYPO'.padEnd(5),
    'NOM'.padEnd(40),
    'ACTUEL'.padEnd(18),
    'PROPOSE'.padEnd(18),
    'ACTION',
  );
  console.log('-'.repeat(110));

  const updates: Array<{
    id: string;
    code_analytique: string | null;
    ref: string;
  }> = [];

  for (const p of projets ?? []) {
    const typoCode = p.typologie?.code ?? '?';
    const proposed = TYPOLOGIE_TO_CODE[typoCode] ?? null;
    const current = p.code_analytique ?? null;
    let action = 'ok';
    if (proposed && !current) {
      action = 'SET';
      updates.push({ id: p.id, code_analytique: proposed, ref: p.ref ?? '?' });
    } else if (proposed && current && proposed !== current) {
      action = `keep (conflit avec ${proposed})`;
    } else if (!proposed && !current) {
      action = '-';
    }
    console.log(
      (p.ref ?? '-').padEnd(14),
      typoCode.padEnd(5),
      (p.client?.raison_sociale ?? '-').slice(0, 39).padEnd(40),
      (current ?? '-').padEnd(18),
      (proposed ?? '-').padEnd(18),
      action,
    );
  }

  console.log(`\n${updates.length} projets à mettre à jour.\n`);

  if (!APPLY) {
    console.log('(dry-run) Relancer avec --apply pour appliquer.\n');
    return;
  }

  for (const u of updates) {
    const { error: updErr } = await supabase
      .from('projets')
      .update({ code_analytique: u.code_analytique })
      .eq('id', u.id);
    if (updErr) {
      console.error(`Erreur ${u.ref}: ${updErr.message}`);
    } else {
      console.log(`OK ${u.ref} -> ${u.code_analytique}`);
    }
  }
}

main().catch((err) => {
  console.error('Erreur :', err);
  process.exit(1);
});
