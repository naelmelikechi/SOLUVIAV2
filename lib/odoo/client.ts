import { logger } from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Odoo client interface
// ---------------------------------------------------------------------------

export interface OdooInvoicePayload {
  ref: string;
  partner_siret: string;
  partner_name: string;
  partner_vat: string | null;
  date_invoice: string;
  date_due: string;
  taux_tva: number;
  lines: Array<{
    description: string;
    quantity: number;
    price_unit: number;
  }>;
  is_credit_note: boolean;
  // Quand true, la facture reste en draft cote Odoo (pas de action_post).
  // Utilise pour les clients de demo (clients.is_demo = true) afin que les
  // factures de test n entrent pas dans les livres comptables.
  is_draft?: boolean;
}

export interface OdooPayment {
  odoo_id: string;
  invoice_odoo_id: string;
  amount: number;
  date: string;
}

export interface OdooClient {
  pushInvoice(payload: OdooInvoicePayload): Promise<{ odoo_id: string }>;
  pushCreditNote(payload: OdooInvoicePayload): Promise<{ odoo_id: string }>;
  pullPayments(since: string): Promise<OdooPayment[]>;
}

const SCOPE = 'odoo.client';

// ---------------------------------------------------------------------------
// JSON-RPC implementation
// ---------------------------------------------------------------------------

interface OdooConfig {
  url: string;
  db: string;
  username: string;
  apiKey: string;
}

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number | null;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: { message?: string; debug?: string; name?: string };
  };
}

class OdooRpcError extends Error {
  constructor(
    message: string,
    public readonly debug?: string,
  ) {
    super(message);
    this.name = 'OdooRpcError';
  }
}

class OdooJsonRpcClient implements OdooClient {
  private uid: number | null = null;
  private taxId20: number | null = null;

  constructor(private readonly config: OdooConfig) {}

  // -------- Low-level transport --------

  private async rpc<T>(
    service: 'common' | 'object',
    method: string,
    args: unknown[],
  ): Promise<T> {
    const res = await fetch(`${this.config.url}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: { service, method, args },
        id: Date.now(),
      }),
    });

    if (!res.ok) {
      throw new OdooRpcError(`HTTP ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as JsonRpcResponse<T>;
    if (json.error) {
      throw new OdooRpcError(
        json.error.data?.message ?? json.error.message,
        json.error.data?.debug,
      );
    }
    if (json.result === undefined) {
      throw new OdooRpcError('Empty Odoo response');
    }
    return json.result;
  }

  private async authenticate(): Promise<number> {
    if (this.uid !== null) return this.uid;
    const uid = await this.rpc<number | false>('common', 'authenticate', [
      this.config.db,
      this.config.username,
      this.config.apiKey,
      {},
    ]);
    if (!uid || typeof uid !== 'number') {
      throw new OdooRpcError('Authentication failed (bad credentials or DB)');
    }
    this.uid = uid;
    logger.info(SCOPE, 'Authenticated', { uid });
    return uid;
  }

  private async executeKw<T>(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ): Promise<T> {
    const uid = await this.authenticate();
    return this.rpc<T>('object', 'execute_kw', [
      this.config.db,
      uid,
      this.config.apiKey,
      model,
      method,
      args,
      kwargs,
    ]);
  }

  // -------- Domain helpers --------

  private async findOrCreatePartner(
    siret: string,
    name: string,
    vat: string | null,
  ): Promise<number> {
    const cleanSiret = siret.replace(/\s/g, '');
    const cleanVat = vat?.replace(/\s/g, '') ?? null;

    // Try VAT first (most specific), then SIRET, then name
    const domains: Array<unknown[][]> = [];
    if (cleanVat) domains.push([['vat', '=', cleanVat]]);
    if (cleanSiret) {
      domains.push([['vat', '=', cleanSiret]]);
      domains.push([['company_registry', '=', cleanSiret]]);
    }
    domains.push([['name', '=ilike', name]]);

    for (const domain of domains) {
      const ids = await this.executeKw<number[]>(
        'res.partner',
        'search',
        [domain],
        { limit: 1 },
      );
      if (ids.length > 0 && ids[0] !== undefined) return ids[0];
    }

    const created = await this.executeKw<number>('res.partner', 'create', [
      {
        name,
        vat: cleanVat,
        company_registry: cleanSiret || false,
        is_company: true,
      },
    ]);
    logger.info(SCOPE, 'Created partner', { id: created, name });
    return created;
  }

  private async findSaleTax(rate: number): Promise<number | null> {
    if (rate === 20 && this.taxId20 !== null) return this.taxId20;
    const ids = await this.executeKw<number[]>(
      'account.tax',
      'search',
      [
        [
          ['type_tax_use', '=', 'sale'],
          ['amount', '=', rate],
          ['amount_type', '=', 'percent'],
        ],
      ],
      { limit: 1 },
    );
    const id = ids[0] ?? null;
    if (rate === 20 && id !== null) this.taxId20 = id;
    return id;
  }

  // -------- Push invoice / credit note --------

  private async pushMove(
    payload: OdooInvoicePayload,
  ): Promise<{ odoo_id: string }> {
    const partnerId = await this.findOrCreatePartner(
      payload.partner_siret,
      payload.partner_name,
      payload.partner_vat,
    );

    const taxId = await this.findSaleTax(payload.taux_tva);
    const taxIdsCmd: unknown[] = taxId ? [[6, 0, [taxId]]] : [[5]];

    const moveType = payload.is_credit_note ? 'out_refund' : 'out_invoice';
    const lineIds = payload.lines.map((l) => [
      0,
      0,
      {
        name: l.description,
        quantity: l.quantity,
        price_unit: l.price_unit,
        tax_ids: taxIdsCmd,
      },
    ]);

    const moveId = await this.executeKw<number>('account.move', 'create', [
      {
        move_type: moveType,
        partner_id: partnerId,
        invoice_date: payload.date_invoice,
        invoice_date_due: payload.date_due,
        ref: payload.ref,
        invoice_line_ids: lineIds,
      },
    ]);

    // Post the invoice (draft -> posted) sauf si is_draft (mode demo)
    if (!payload.is_draft) {
      await this.executeKw<boolean>('account.move', 'action_post', [[moveId]]);
    }

    logger.info(
      SCOPE,
      payload.is_draft ? 'Created draft move' : 'Posted move',
      {
        ref: payload.ref,
        odoo_id: moveId,
        type: moveType,
        is_draft: payload.is_draft ?? false,
      },
    );
    return { odoo_id: String(moveId) };
  }

  async pushInvoice(payload: OdooInvoicePayload) {
    return this.pushMove(payload);
  }

  async pushCreditNote(payload: OdooInvoicePayload) {
    return this.pushMove({ ...payload, is_credit_note: true });
  }

  // -------- Pull payments --------

  async pullPayments(since: string): Promise<OdooPayment[]> {
    type PaymentRecord = {
      id: number;
      amount: number;
      date: string;
      reconciled_invoice_ids: number[];
    };

    const payments = await this.executeKw<PaymentRecord[]>(
      'account.payment',
      'search_read',
      [
        [
          ['state', '=', 'posted'],
          ['payment_type', '=', 'inbound'],
          ['date', '>=', since.slice(0, 10)],
        ],
      ],
      { fields: ['id', 'amount', 'date', 'reconciled_invoice_ids'] },
    );

    const result: OdooPayment[] = [];
    for (const p of payments) {
      for (const invoiceId of p.reconciled_invoice_ids) {
        result.push({
          odoo_id: `${p.id}-${invoiceId}`,
          invoice_odoo_id: String(invoiceId),
          amount: Number(p.amount),
          date: p.date,
        });
      }
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Stub implementation (used when env vars are missing)
// ---------------------------------------------------------------------------

function createStubOdooClient(): OdooClient {
  return {
    async pushInvoice(payload) {
      const odoo_id = `ODOO-STUB-${Date.now()}`;
      logger.info(SCOPE, 'pushInvoice (stub)', {
        ref: payload.ref,
        odoo_id,
        lines: payload.lines.length,
      });
      return { odoo_id };
    },
    async pushCreditNote(payload) {
      const odoo_id = `ODOO-STUB-CN-${Date.now()}`;
      logger.info(SCOPE, 'pushCreditNote (stub)', {
        ref: payload.ref,
        odoo_id,
        lines: payload.lines.length,
      });
      return { odoo_id };
    },
    async pullPayments(since) {
      logger.info(SCOPE, 'pullPayments (stub)', { since });
      return [];
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Returns an OdooClient.
 *
 * Reads ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY from env.
 * Falls back to a stub if any is missing (so local dev keeps working
 * without Odoo configured).
 */
export function createOdooClient(): OdooClient {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;

  if (!url || !db || !username || !apiKey) {
    logger.warn(SCOPE, 'Odoo env vars missing - using stub client');
    return createStubOdooClient();
  }

  return new OdooJsonRpcClient({ url, db, username, apiKey });
}
