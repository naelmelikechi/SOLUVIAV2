/**
 * Dry-run Eduvia : ping /status + count contrats pour la cle HEOL ACADEMY.
 * Aucune ecriture en BDD. Utilise pour valider la cle avant un vrai sync.
 *
 * Usage : npx tsx scripts/eduvia-dryrun.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createAdminClient } from '@/lib/supabase/admin';
import { decryptApiKey } from '@/lib/utils/encryption';
import { baseUrlFrom } from '@/lib/eduvia/client';

const CLIENT_ID = 'e90e35f9-1db4-4fd2-970e-fc92ebe1c74d';

async function main() {
  const supabase = createAdminClient();

  const { data: keys, error } = await supabase
    .from('client_api_keys')
    .select('id, label, api_key_encrypted, instance_url, is_active')
    .eq('client_id', CLIENT_ID);

  if (error || !keys || keys.length === 0) {
    console.error('Aucune cle API trouvee:', error?.message);
    process.exit(1);
  }

  for (const k of keys) {
    console.log(`\n=== ${k.label} (${k.is_active ? 'actif' : 'inactif'}) ===`);
    console.log('  instance_url:', k.instance_url);

    if (!k.instance_url) {
      console.error('  instance_url manquant');
      continue;
    }

    let apiKey: string;
    try {
      apiKey = decryptApiKey(k.api_key_encrypted);
      console.log('  cle dechiffree OK (len=' + apiKey.length + ')');
    } catch (err) {
      console.error(
        '  dechiffrement KO:',
        err instanceof Error ? err.message : err,
      );
      continue;
    }

    const baseUrl = baseUrlFrom(k.instance_url);
    console.log('  baseUrl:', baseUrl);

    // 1. /status
    const statusUrl = `${baseUrl}/api/v1/status`;
    console.log(`\n  GET ${statusUrl}`);
    try {
      const res = await fetch(statusUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8_000),
      });
      console.log('    HTTP', res.status);
      if (res.ok) {
        const body = await res.json();
        console.log('    body:', JSON.stringify(body));
      } else {
        const text = await res.text();
        console.log('    body:', text.slice(0, 300));
      }
    } catch (err) {
      console.error('    fetch KO:', err instanceof Error ? err.message : err);
      continue;
    }

    // 2. /contracts (count)
    const contractsUrl = `${baseUrl}/api/v1/contracts?page=1&per_page=1`;
    console.log(`\n  GET ${contractsUrl}`);
    try {
      const res = await fetch(contractsUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
      });
      console.log('    HTTP', res.status);
      if (res.ok) {
        const body = await res.json();
        const total =
          body?.meta?.total ??
          body?.total ??
          body?.pagination?.total ??
          (Array.isArray(body?.data) ? body.data.length : null);
        console.log('    total contrats:', total);
        console.log(
          '    cle exemple data[0]:',
          body?.data?.[0]?.id ?? '(aucun)',
        );
        console.log(
          '    meta:',
          JSON.stringify(body?.meta ?? body?.pagination ?? {}),
        );
      } else {
        const text = await res.text();
        console.log('    body:', text.slice(0, 300));
      }
    } catch (err) {
      console.error('    fetch KO:', err instanceof Error ? err.message : err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
