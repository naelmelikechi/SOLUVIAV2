import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  fetchContractInvoiceLines,
  type EduviaInvoiceLine,
} from '@/lib/eduvia/client';

const LINE: EduviaInvoiceLine = {
  id: 79,
  invoice_id: 61,
  amount: 2666.56,
  line_type: 'PEDAGOGIE',
  quantity: 1,
  description: 'Échéance n°1 - Frais pédagogiques',
  created_at: '2026-05-07T16:11:22.891+02:00',
  updated_at: '2026-05-07T16:11:22.891+02:00',
};

/** Réponse paginée Eduvia : data + meta (l'endpoint contracts/:id/invoice_lines pagine). */
function pageResponse(
  data: EduviaInvoiceLine[],
  { current_page = 1, total_pages = 1 } = {},
): Response {
  return new Response(
    JSON.stringify({
      data,
      meta: {
        current_page,
        total_pages,
        total_count: data.length,
        per_page: 100,
      },
    }),
    { status: 200 },
  );
}

describe('fetchContractInvoiceLines', () => {
  afterEach(() => vi.restoreAllMocks());

  it('GET /api/v1/contracts/:id/invoice_lines (paginé per_page=100) et renvoie data[]', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(pageResponse([LINE]));

    const lines = await fetchContractInvoiceLines(
      'heol.eduvia.app',
      'fake-key',
      65,
    );

    expect(lines).toEqual([LINE]);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.heol.eduvia.app/api/v1/contracts/65/invoice_lines?page=1&per_page=100',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer fake-key' }),
      }),
    );
  });

  it('agrège toutes les pages quand un contrat long dépasse une page', async () => {
    const line2: EduviaInvoiceLine = { ...LINE, id: 80, invoice_id: 62 };
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        pageResponse([LINE], { current_page: 1, total_pages: 2 }),
      )
      .mockResolvedValueOnce(
        pageResponse([line2], { current_page: 2, total_pages: 2 }),
      );

    const lines = await fetchContractInvoiceLines('heol.eduvia.app', 'k', 65);

    expect(lines).toEqual([LINE, line2]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('renvoie [] quand le contrat n’a aucune ligne émise', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(pageResponse([]));

    const lines = await fetchContractInvoiceLines('heol.eduvia.app', 'k', 999);

    expect(lines).toEqual([]);
  });
});
