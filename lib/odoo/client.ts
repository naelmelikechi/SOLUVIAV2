import { logger } from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Odoo client interface
// ---------------------------------------------------------------------------

export interface OdooInvoicePayload {
  ref: string;
  partner_siret: string;
  date_invoice: string;
  date_due: string;
  lines: Array<{
    description: string;
    quantity: number;
    price_unit: number;
  }>;
  is_credit_note: boolean;
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

// ---------------------------------------------------------------------------
// Stub implementation
// ---------------------------------------------------------------------------
// This stub is the REAL implementation for now. When the actual Odoo XML-RPC
// integration is ready, replace the body of each method while keeping the
// interface unchanged.
// ---------------------------------------------------------------------------

const SCOPE = 'odoo.client';

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

/**
 * Returns an OdooClient.
 *
 * Today this is a stub that logs and returns mock IDs.
 * When Odoo is in production, swap the implementation here --
 * all call sites stay untouched.
 */
export function createOdooClient(): OdooClient {
  return createStubOdooClient();
}
