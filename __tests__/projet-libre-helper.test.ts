import { describe, it, expect, vi } from 'vitest';
import { getOrCreateProjetLibre } from '@/lib/projets/projet-libre';
import type { SupabaseServerClient } from '@/lib/actions/factures/brouillons-shared';

function fakeSupabase(rpcResult: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => rpcResult) };
}

describe('getOrCreateProjetLibre', () => {
  it('retourne le projetId renvoye par la RPC', async () => {
    const sb = fakeSupabase({ data: 'projet-libre-id', error: null });
    const r = await getOrCreateProjetLibre(
      sb as unknown as SupabaseServerClient,
      'client-1',
    );
    expect(r).toEqual({ ok: true, projetId: 'projet-libre-id' });
    expect(sb.rpc).toHaveBeenCalledWith('get_or_create_projet_libre', {
      p_client_id: 'client-1',
    });
  });

  it('remonte une erreur si la RPC echoue', async () => {
    const sb = fakeSupabase({ data: null, error: { message: 'boom' } });
    const r = await getOrCreateProjetLibre(
      sb as unknown as SupabaseServerClient,
      'client-1',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/boom/);
  });

  it('remonte une erreur si data est null sans erreur', async () => {
    const sb = fakeSupabase({ data: null, error: null });
    const r = await getOrCreateProjetLibre(
      sb as unknown as SupabaseServerClient,
      'client-1',
    );
    expect(r.ok).toBe(false);
  });
});
