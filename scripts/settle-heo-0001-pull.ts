// Remediation one-shot : propage vers SOLUVIA le paiement de FAC-HEO-0001 (move
// Odoo 134) apres son lettrage manuel cote Odoo. Replique EXACTEMENT la logique
// de pullPayments (lib/odoo/sync.ts) pour cette facture : lit
// invoice_payments_widget, derive le meme odoo_id (donc idempotent avec le cron),
// upsert le paiement et passe la facture en 'payee' si Odoo dit paid/in_payment.
//
// N'importe PAS lib/odoo/sync.ts (qui tire server-only via le rendu PDF) : RPC
// Odoo inline + supabase-js direct.
//
// Run : npx tsx scripts/settle-heo-0001-pull.ts

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env.local') });

const ODOO_URL = process.env.ODOO_URL!;
const ODOO_DB = process.env.ODOO_DB!;
const ODOO_USERNAME = process.env.ODOO_USERNAME!;
const ODOO_API_KEY = process.env.ODOO_API_KEY!;
const MOVE_ID = 134;

async function rpc<T>(
  service: string,
  method: string,
  args: unknown[],
): Promise<T> {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: { service, method, args },
      id: Date.now(),
    }),
  });
  const json = (await res.json()) as {
    result?: T;
    error?: { data?: { message?: string }; message?: string };
  };
  if (json.error)
    throw new Error(
      json.error.data?.message ?? json.error.message ?? 'rpc error',
    );
  return json.result as T;
}

async function main() {
  const uid = await rpc<number>('common', 'authenticate', [
    ODOO_DB,
    ODOO_USERNAME,
    ODOO_API_KEY,
    {},
  ]);
  const exec = <T>(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ) =>
    rpc<T>('object', 'execute_kw', [
      ODOO_DB,
      uid,
      ODOO_API_KEY,
      model,
      method,
      args,
      kwargs,
    ]);

  type WidgetEntry = {
    amount: number;
    date: string;
    partial_id?: number;
    is_refund?: boolean;
    account_payment_id?: number | false;
  };
  type MoveRow = {
    id: number;
    payment_state: string;
    invoice_payments_widget: { content?: WidgetEntry[] } | false;
  };
  const moves = await exec<MoveRow[]>('account.move', 'read', [[MOVE_ID]], {
    fields: ['payment_state', 'invoice_payments_widget'],
  });
  const m = moves[0];
  if (!m) throw new Error(`move ${MOVE_ID} introuvable`);

  const widget = m.invoice_payments_widget;
  const content =
    widget && typeof widget === 'object' ? (widget.content ?? []) : [];
  const payments = content
    .filter((c) => !c.is_refund)
    .map((c, i) => ({
      odoo_id:
        typeof c.account_payment_id === 'number'
          ? `${c.account_payment_id}-${m.id}`
          : `recon-${c.partial_id ?? `${m.id}-${i}`}`,
      amount: Number(c.amount),
      date: c.date,
    }));
  console.log(
    'Odoo payment_state:',
    m.payment_state,
    '| payments:',
    JSON.stringify(payments),
  );

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: fac, error: facErr } = await sb
    .from('factures')
    .select('id, ref, statut')
    .eq('odoo_id', String(MOVE_ID))
    .maybeSingle();
  if (facErr) throw new Error(`load facture: ${facErr.message}`);
  if (!fac)
    throw new Error(`facture odoo_id=${MOVE_ID} introuvable cote SOLUVIA`);
  console.log('Facture SOLUVIA avant:', fac);

  for (const p of payments) {
    const { error } = await sb
      .from('paiements')
      .upsert(
        {
          facture_id: fac.id,
          montant: p.amount,
          date_reception: p.date,
          odoo_id: p.odoo_id,
          saisie_manuelle: false,
        },
        { onConflict: 'odoo_id' },
      );
    if (error)
      throw new Error(`upsert paiement ${p.odoo_id}: ${error.message}`);
  }

  const isPaid = m.payment_state === 'paid' || m.payment_state === 'in_payment';
  if (isPaid && fac.statut !== 'payee') {
    const { error } = await sb
      .from('factures')
      .update({ statut: 'payee' })
      .eq('id', fac.id);
    if (error) throw new Error(`update statut: ${error.message}`);
  }

  const { data: after } = await sb
    .from('factures')
    .select('ref, statut')
    .eq('id', fac.id)
    .maybeSingle();
  const { data: pais } = await sb
    .from('paiements')
    .select('odoo_id, montant, date_reception')
    .eq('facture_id', fac.id);
  console.log('Facture SOLUVIA apres:', after);
  console.log('Paiements SOLUVIA:', JSON.stringify(pais));
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
