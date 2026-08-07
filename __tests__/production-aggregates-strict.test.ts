import { describe, it, expect, vi } from 'vitest';
import { getContratsActifs } from '@/lib/queries/production-aggregates';

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

/**
 * Mode strict de getContratsActifs (audit 2026-08-07, constat 4).
 *
 * Quand la RPC ET son repli echouent, la fonction journalisait puis renvoyait
 * `[]`. Sur un ecran c'est une degradation acceptable ; dans le rapport mensuel
 * envoye par mail, ca annonce une production de 0 EUR pour une panne, et le
 * destinataire n'a aucun moyen de faire la difference.
 *
 * Le contrat par defaut est INCHANGE : seuls les appelants qui ne peuvent pas
 * se permettre un zero silencieux passent `{ strict: true }`.
 */

const ERREUR = { message: 'statement timeout', code: '57014' };

function makeSb(opts: { rpcFail: boolean; fallbackFail: boolean }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    eq: self,
    order: self,
    range: async () => ({
      data: opts.fallbackFail ? null : [],
      error: opts.fallbackFail ? ERREUR : null,
    }),
  });
  return {
    rpc: async () => ({
      data: opts.rpcFail ? null : [],
      error: opts.rpcFail ? ERREUR : null,
    }),
    from: () => chain,
  } as never;
}

describe('getContratsActifs — echec silencieux vs mode strict', () => {
  it('par defaut : RPC et repli en echec renvoient [] (comportement des ecrans)', async () => {
    const sb = makeSb({ rpcFail: true, fallbackFail: true });
    await expect(getContratsActifs(sb, '2026-07', '2026-07')).resolves.toEqual([]);
  });

  it('strict : RPC et repli en echec LEVENT, au lieu d’annoncer zero', async () => {
    const sb = makeSb({ rpcFail: true, fallbackFail: true });
    await expect(
      getContratsActifs(sb, '2026-07', '2026-07', { strict: true }),
    ).rejects.toThrow(/RPC et repli en echec/);
  });

  it('strict : un repli qui REUSSIT apres une RPC en echec ne leve pas', async () => {
    // La RPC est optionnelle par conception (fallback prevu) : seul l'echec des
    // DEUX chemins est une panne.
    const sb = makeSb({ rpcFail: true, fallbackFail: false });
    await expect(
      getContratsActifs(sb, '2026-07', '2026-07', { strict: true }),
    ).resolves.toEqual([]);
  });

  it('strict : une RPC qui reussit ne touche jamais au repli', async () => {
    const sb = makeSb({ rpcFail: false, fallbackFail: true });
    await expect(
      getContratsActifs(sb, '2026-07', '2026-07', { strict: true }),
    ).resolves.toEqual([]);
  });
});
