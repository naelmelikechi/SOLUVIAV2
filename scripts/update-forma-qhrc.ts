/**
 * One-shot: align the FORMA QHRC client fiche with the official
 * CERTIFICAT + FICHE DESCRIPTIVE U.A.I. documents.
 *
 * Schema-backed fields on `clients`: raison_sociale, siret, adresse,
 * localisation, numero_nda, numero_qualiopi, numero_uai, tva_intracommunautaire.
 * All already match the documents except numero_uai (currently null).
 *
 * Run: npx tsx scripts/update-forma-qhrc.ts
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^"|"$/g, ''),
      ];
    })
    .filter(([k]) => k),
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Authoritative values from the FICHE DESCRIPTIVE U.A.I. (état OUVERT) +
// CERTIFICAT block. Only set columns the clients fiche actually has.
const DESIRED = {
  raison_sociale: 'FORMA QHRC',
  siret: '93460479400024', // SIRET courant (NIC 0024, depuis 21/05/2026)
  adresse: '1 IMPASSE DU BACO, 69800 SAINT-PRIEST',
  numero_nda: '84692349469', // N° de déclaration d'activité
  numero_uai: '0694679L', // N° UAI
} as const;

async function main() {
  const { data: clients, error } = await supabase
    .from('clients')
    .select('*')
    .ilike('raison_sociale', '%forma%qhrc%');
  if (error) throw error;

  if (!clients || clients.length !== 1) {
    throw new Error(
      `Expected exactly 1 FORMA QHRC client, found ${clients?.length ?? 0}`,
    );
  }
  const client = clients[0];
  console.log('=== BEFORE ===');
  console.log(JSON.stringify(client, null, 2));

  // Issued-invoice immutability guard: the PDF reads client adresse/siret live.
  // Setting numero_uai (absent from the PDF) is safe regardless, but report.
  const { data: factures, error: fErr } = await supabase
    .from('factures')
    .select('id, ref, numero_seq, statut, montant_ttc, est_avoir')
    .eq('client_id', client.id);
  if (fErr) throw fErr;
  console.log('\n=== factures de ce client ===');
  console.log(JSON.stringify(factures, null, 2));
  const issued = (factures ?? []).filter((f) => f.statut !== 'a_emettre');
  console.log(
    `\nFactures émises/verrouillées (statut != a_emettre): ${issued.length}`,
  );

  // Build a minimal patch: only columns whose current value differs.
  const patch: Record<string, string> = {};
  for (const [k, v] of Object.entries(DESIRED)) {
    if ((client as Record<string, unknown>)[k] !== v) patch[k] = v;
  }

  if (Object.keys(patch).length === 0) {
    console.log('\nAucune mise à jour nécessaire — la fiche est déjà alignée.');
    return;
  }

  console.log('\n=== PATCH ===');
  console.log(JSON.stringify(patch, null, 2));

  const { data: updated, error: uErr } = await supabase
    .from('clients')
    .update(patch)
    .eq('id', client.id)
    .select('*')
    .single();
  if (uErr) throw uErr;

  console.log('\n=== AFTER ===');
  console.log(JSON.stringify(updated, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
