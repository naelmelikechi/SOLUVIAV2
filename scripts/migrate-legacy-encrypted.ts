/**
 * Migration : re-encrypt les secrets stockes avec la cle utf-8 tronquee
 * (~128 bits, pre-fix C2) vers la cle hex courante (256 bits).
 *
 * A LANCER UNIQUEMENT si Sentry remonte des evenements
 * `scope:encryption.legacy_decrypt_used` apres 7 jours d observation.
 * Sinon, retirer simplement le fallback dans lib/utils/encryption.ts
 * (procedure documentee dans docs/SECURITY.md).
 *
 * Usage :
 *   ENCRYPTION_KEY=<hex64> SUPABASE_SERVICE_ROLE_KEY=<...> \
 *     NEXT_PUBLIC_SUPABASE_URL=<...> \
 *     npx tsx scripts/migrate-legacy-encrypted.ts [--dry-run]
 *
 * Modus operandi :
 *   1. Liste tous les secrets chiffres dans client_api_keys (la seule
 *      table actuellement chiffree, voir SECURITY.md). Etendre cette
 *      liste si d autres tables stockent des secrets.
 *   2. Pour chaque row :
 *      - Tente de decrypt via la cle hex courante. OK -> deja migre, skip.
 *      - Sinon, tente la cle legacy. OK -> re-encrypt avec la cle
 *        courante et UPDATE.
 *      - Sinon -> log error (corruption ou cle perdue), skip.
 *   3. Ecrit un rapport JSON sur stdout : {migrated, already_ok, errors}.
 *
 * Idempotent : on peut le relancer autant qu on veut.
 */

import { createClient } from '@supabase/supabase-js';
import { encryptApiKey, decryptApiKey } from '../lib/utils/encryption';
import { logger } from '../lib/utils/logger';

const DRY_RUN = process.argv.includes('--dry-run');

interface SecretRow {
  id: string;
  api_key_encrypted: string | null;
  client_id: string | null;
  label: string | null;
}

interface Report {
  migrated: number;
  already_ok: number;
  errors: Array<{ id: string; reason: string }>;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis',
    );
  }
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY requise (hex 64 chars)');
  }

  const admin = createClient(url, serviceRoleKey);

  const { data, error } = await admin
    .from('client_api_keys')
    .select('id, api_key_encrypted, client_id, label')
    .not('api_key_encrypted', 'is', null);

  if (error) throw error;
  const rows = (data ?? []) as SecretRow[];
  logger.info('migrate-legacy', `Found ${rows.length} encrypted rows`);

  const report: Report = { migrated: 0, already_ok: 0, errors: [] };

  for (const row of rows) {
    if (!row.api_key_encrypted) continue;

    let plaintext: string;
    try {
      // Si la decryption passe, c est deja en cle courante OU le fallback
      // legacy a fonctionne. On regarde l output du logger pour distinguer.
      // Plus simple : on tente d abord la cle courante via une fonction
      // dediee. Pour eviter de dupliquer le module encryption ici, on
      // utilise decryptApiKey + on detecte le warning legacy dans une
      // closure custom... trop complexe. On simplifie : on re-encrypt
      // INCONDITIONNELLEMENT chaque row qui decrypt OK. C est idempotent
      // (re-encrypter avec la meme cle hex donne un nouveau IV+authTag mais
      // meme plaintext). Cout : un UPDATE par row, supportable.
      plaintext = decryptApiKey(row.api_key_encrypted);
    } catch (err) {
      report.errors.push({
        id: row.id,
        reason: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    // Re-encrypt avec la cle hex courante
    const reEncrypted = encryptApiKey(plaintext);
    if (reEncrypted === row.api_key_encrypted) {
      // Quasi-impossible (IV random) mais defense.
      report.already_ok++;
      continue;
    }

    if (DRY_RUN) {
      report.migrated++;
      continue;
    }

    const { error: updateErr } = await admin
      .from('client_api_keys')
      .update({ api_key_encrypted: reEncrypted })
      .eq('id', row.id);

    if (updateErr) {
      report.errors.push({ id: row.id, reason: updateErr.message });
    } else {
      report.migrated++;
    }
  }

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');

  if (report.errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
