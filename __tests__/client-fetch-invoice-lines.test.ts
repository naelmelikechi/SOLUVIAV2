import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchInvoiceLines, type EduviaInvoiceLine } from '@/lib/eduvia/client';

const SAMPLE_LINES: EduviaInvoiceLine[] = [
  {
    id: 79,
    invoice_id: 61,
    amount: 2666.56,
    line_type: 'PEDAGOGIE',
    quantity: 1,
    description: 'Échéance n°1 - Frais pédagogiques',
    created_at: '2026-05-07T16:11:22.891+02:00',
    updated_at: '2026-05-07T16:11:22.891+02:00',
  },
];

describe('fetchInvoiceLines', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ data: SAMPLE_LINES }), { status: 200 }),
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('GET /api/v1/invoices/:id/lines et renvoie data[]', async () => {
    const lines = await fetchInvoiceLines('heol.eduvia.app', 'fake-key', 61);

    expect(lines).toEqual(SAMPLE_LINES);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.heol.eduvia.app/api/v1/invoices/61/lines',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer fake-key' }),
      }),
    );
  });

  it('renvoie [] si data est absent dans la réponse', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    const lines = await fetchInvoiceLines('heol.eduvia.app', 'k', 999);
    expect(lines).toEqual([]);
  });
});
