/**
 * One-shot import of CFA prospects from an Excel file.
 *
 * Usage:
 *   npx tsx scripts/import-prospects.ts /path/to/file.xlsx [--type cfa|entreprise]
 *
 * Reads the Excel, maps columns to the prospects table, upserts on SIRET.
 *
 * Env vars required (from .env.local):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY (bypasses RLS)
 */
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

// Load .env.local
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const idx = l.indexOf('=');
      if (idx < 0) return ['', ''] as [string, string];
      let v = l.slice(idx + 1).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      // Strip embedded \n literals (e.g. trailing \n in quoted URL values)
      v = v.replace(/\\n/g, '').trim();
      return [l.slice(0, idx).trim(), v] as [string, string];
    })
    .filter(([k]) => k),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const filePath = args[0];
const typeArgIdx = args.indexOf('--type');
const typeProspect = (typeArgIdx >= 0 ? args[typeArgIdx + 1] : 'cfa') as
  | 'cfa'
  | 'entreprise';

if (!filePath) {
  console.error(
    'Usage: npx tsx scripts/import-prospects.ts <file.xlsx> [--type cfa|entreprise]',
  );
  process.exit(1);
}

function truthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  if (!s) return false;
  if (['0', 'non', 'no', 'faux', 'false'].includes(s)) return false;
  return true;
}

function cleanSiret(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const digits = String(v).replace(/\D/g, '');
  return digits.length === 14 ? digits : null;
}

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

interface ProspectRow {
  type_prospect: 'cfa' | 'entreprise';
  nom: string;
  region: string | null;
  siret: string | null;
  volume_apprenants: number | null;
  dirigeant_nom: string | null;
  dirigeant_email: string | null;
  dirigeant_telephone: string | null;
  dirigeant_poste: string | null;
  site_web: string | null;
  emails_generiques: string | null;
  telephone_standard: string | null;
  notes_import: string | null;
  stage: 'non_contacte' | 'r1' | 'r2' | 'signe';
}

function deriveStage(row: Record<string, unknown>): ProspectRow['stage'] {
  if (truthy(row['Contractualisé'])) return 'signe';
  if (truthy(row['R2 validé'])) return 'r2';
  if (truthy(row['R1 validé'])) return 'r1';
  return 'non_contacte';
}

console.log(`Reading ${filePath}...`);
const wb = XLSX.readFile(filePath);
const sheetName = wb.SheetNames[0];
if (!sheetName) {
  console.error('No sheet found');
  process.exit(1);
}
const sheet = wb.Sheets[sheetName];
if (!sheet) {
  console.error('Sheet is empty');
  process.exit(1);
}
const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
  defval: null,
});
console.log(`Found ${rows.length} rows in sheet "${sheetName}"`);

const mapped: ProspectRow[] = [];
let skippedNoNom = 0;
let skippedBadSiret = 0;
for (const r of rows) {
  const nom = strOrNull(r['Nom du CFA'] ?? r['Nom']);
  if (!nom) {
    skippedNoNom++;
    continue;
  }
  const rawSiret = r['SIRET'];
  const siret = cleanSiret(rawSiret);
  if (
    rawSiret !== null &&
    rawSiret !== undefined &&
    rawSiret !== '' &&
    siret === null
  ) {
    skippedBadSiret++;
  }
  mapped.push({
    type_prospect: typeProspect,
    nom,
    region: strOrNull(r['Région']),
    siret,
    volume_apprenants: intOrNull(r["Nombre d'apprentis"]),
    dirigeant_nom: strOrNull(r['Nom du dirigeant']),
    dirigeant_email: strOrNull(r['Mail du dirigeant']),
    dirigeant_telephone: strOrNull(r['Téléphone']),
    dirigeant_poste: strOrNull(r['Poste']),
    site_web: strOrNull(r['Site web']),
    emails_generiques: strOrNull(r['Emails génériques']),
    telephone_standard: strOrNull(r['Tél standard']),
    notes_import: strOrNull(r['Notes']),
    stage: deriveStage(r),
  });
}

console.log(
  `Mapped ${mapped.length} valid rows (skipped ${skippedNoNom} for missing nom)`,
);
console.log(
  `  Rows with malformed/non-14-digit SIRET stored as null: ${skippedBadSiret}`,
);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Insert in batches of 500 to stay under PostgREST payload limits.
const BATCH_SIZE = 500;
let inserted = 0;
let errors = 0;
const errorSamples: string[] = [];

// Split into rows with siret (upsert on siret) and without (plain insert)
const withSiret = mapped.filter((r) => r.siret !== null);
const withoutSiret = mapped.filter((r) => r.siret === null);

// NOTE: PostgREST upsert requires a named UNIQUE CONSTRAINT, not just a unique index.
// The prospects table has a partial unique index (WHERE siret IS NOT NULL) which
// PostgREST cannot use as a conflict target. Strategy:
//   1. Fetch all existing SIRETs from DB to detect duplicates.
//   2. Insert new rows (skipping existing SIRETs), plain INSERT — no conflict needed.
//   3. For rows without SIRET, always insert (no dedup possible).

async function processBatch(batch: ProspectRow[]): Promise<number> {
  const { error } = await supabase.from('prospects').insert(batch);
  if (error) {
    errors += batch.length;
    if (errorSamples.length < 3) errorSamples.push(error.message);
    console.error(`  ERROR: ${error.message}`);
    return 0;
  }
  return batch.length;
}

async function main() {
  // Fetch existing SIRETs to avoid duplicate inserts on re-run
  console.log('\nFetching existing SIRETs from DB...');
  const { data: existing, error: fetchErr } = await supabase
    .from('prospects')
    .select('siret')
    .not('siret', 'is', null);
  if (fetchErr) {
    console.error('Failed to fetch existing SIRETs:', fetchErr.message);
    process.exit(1);
  }
  const existingSirets = new Set(
    (existing ?? []).map((r: { siret: string }) => r.siret),
  );
  console.log(`  ${existingSirets.size} existing SIRETs found in DB`);

  const toInsertWithSiret = withSiret.filter(
    (r) => !existingSirets.has(r.siret!),
  );
  const skippedDuplicates = withSiret.length - toInsertWithSiret.length;
  if (skippedDuplicates > 0) {
    console.log(`  ${skippedDuplicates} rows skipped (SIRET already in DB)`);
  }

  const allToInsert = [...toInsertWithSiret, ...withoutSiret];
  console.log(
    `\nInserting ${allToInsert.length} rows in batches of ${BATCH_SIZE}...`,
  );

  for (let i = 0; i < allToInsert.length; i += BATCH_SIZE) {
    const batch = allToInsert.slice(i, i + BATCH_SIZE);
    const n = await processBatch(batch);
    inserted += n;
    process.stdout.write(
      `  batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allToInsert.length / BATCH_SIZE)}: +${n}\n`,
    );
  }

  console.log('\n--- Done ---');
  console.log(`  Total mapped:             ${mapped.length}`);
  console.log(`  Duplicates skipped:       ${skippedDuplicates}`);
  console.log(`  Total inserted:           ${inserted}`);
  console.log(`  Errors:                   ${errors}`);
  if (errorSamples.length)
    console.log(`  Error samples: ${errorSamples.join(' | ')}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
