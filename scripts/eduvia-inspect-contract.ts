/**
 * Inspecte la reponse brute de l API Eduvia pour un contrat.
 * Sert a decouvrir des champs non syncs (notamment OPCO).
 *
 * Usage : npx tsx --env-file=.env.local scripts/eduvia-inspect-contract.ts
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

  const { data: key } = await supabase
    .from('client_api_keys')
    .select('api_key_encrypted, instance_url')
    .eq('client_id', CLIENT_ID)
    .single();

  if (!key) {
    console.error('Cle introuvable');
    process.exit(1);
  }

  const apiKey = decryptApiKey(key.api_key_encrypted);
  const baseUrl = baseUrlFrom(key.instance_url!);

  const endpoints = [
    '/api/v1/contracts/12',
    '/api/v1/invoices?per_page=2',
    '/api/v1/invoice_steps?per_page=2',
    '/api/v1/companies/2',
  ];

  for (const ep of endpoints) {
    console.log(`\n=== GET ${ep} ===\n`);
    try {
      const res = await fetch(`${baseUrl}${ep}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
      });
      console.log('HTTP', res.status);
      if (res.ok) {
        const body = await res.json();
        console.log(JSON.stringify(body, null, 2).slice(0, 2000));
      } else {
        console.log(await res.text());
      }
    } catch (e) {
      console.log('error:', e instanceof Error ? e.message : e);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
