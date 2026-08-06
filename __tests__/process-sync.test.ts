import { describe, it, expect, vi } from 'vitest';
import { syncProcessIndex } from '@/lib/process/sync';
import type { FinalizedFiche } from '@/lib/process/types';

function fiche(
  id: string,
  contentHash: string,
  detailHash = `d-${id}`,
): FinalizedFiche {
  return {
    fiche_id: id,
    mission_code: 'B',
    mission_nom: 'Mission B',
    fiche_code: `B-${id}`,
    titre: `Fiche ${id}`,
    priorite: 'P1',
    contenu: `contenu ${id}`,
    content_hash: contentHash,
    detail: {
      mission: { code: 'B', nom: 'M' },
      fiche: {
        code: `B-${id}`,
        titre: 'F',
        description: null,
        priorite: 'P1',
        statut: 'actif',
      },
      taches: [],
    },
    detail_hash: detailHash,
  };
}

function fakeAdmin(
  existing: {
    source_fiche_id: string;
    content_hash: string;
    detail_hash: string;
  }[],
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upserted: any[] = [];
  const deleted: string[] = [];
  return {
    upserted,
    deleted,
    from() {
      return {
        select: () => Promise.resolve({ data: existing, error: null }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        upsert: (rows: any[]) => {
          upserted.push(...rows);
          return Promise.resolve({ error: null });
        },
        delete: () => ({
          in: (_c: string, ids: string[]) => {
            deleted.push(...ids);
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
  };
}

describe('syncProcessIndex', () => {
  it('embed + upsert uniquement les fiches nouvelles ou au hash modifié', async () => {
    const source = [fiche('1', 'h1-NEW'), fiche('2', 'h2')];
    const admin = fakeAdmin([
      { source_fiche_id: '1', content_hash: 'h1-OLD', detail_hash: 'd-1' },
      { source_fiche_id: '2', content_hash: 'h2', detail_hash: 'd-2' },
    ]);
    const embedMany = vi.fn(async (texts: string[]) =>
      texts.map(() => [0.1, 0.2]),
    );

    const res = await syncProcessIndex({
      fetchSource: async () => source,
      embedMany,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin: admin as any,
      sourceBaseUrl: 'https://process.example.com',
    });

    expect(embedMany).toHaveBeenCalledOnce();
    expect(embedMany.mock.calls[0]![0]).toEqual(['contenu 1']);
    expect(admin.upserted).toHaveLength(1);
    expect(admin.upserted[0].source_fiche_id).toBe('1');
    expect(admin.upserted[0].url).toBe('https://process.example.com/fiches/1');
    expect(admin.upserted[0].embedding).toEqual([0.1, 0.2]);
    expect(res.upserted).toBe(1);
  });

  it("supprime de l'index les fiches absentes de la source", async () => {
    const source = [fiche('1', 'h1')];
    const admin = fakeAdmin([
      { source_fiche_id: '1', content_hash: 'h1', detail_hash: 'd-1' },
      { source_fiche_id: '9', content_hash: 'h9', detail_hash: 'd-9' },
    ]);
    const res = await syncProcessIndex({
      fetchSource: async () => source,
      embedMany: async () => [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin: admin as any,
      sourceBaseUrl: 'https://process.example.com',
    });
    expect(admin.deleted).toEqual(['9']);
    expect(res.deleted).toBe(1);
  });

  it('garde anti-wipe : source à 0 fiche mais index peuplé → aucune suppression', async () => {
    // Régression (audit #122, constat 9). Une source qui répond 200 avec
    // { "fiches": [] } — ou dont le champ `fiches` a été renommé, ce que le
    // `?? []` avalait — est indistinguable d'une source cassée. La suppression
    // des fiches absentes vidait alors tout l'index, et le cron répondait
    // { ok: true }. Coût réel : RAG process vide jusqu'à 24 h et re-paiement
    // d'un embedding complet.
    const admin = fakeAdmin([
      { source_fiche_id: '1', content_hash: 'h1', detail_hash: 'd-1' },
      { source_fiche_id: '2', content_hash: 'h2', detail_hash: 'd-2' },
    ]);
    await expect(
      syncProcessIndex({
        fetchSource: async () => [],
        embedMany: async () => [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        admin: admin as any,
        sourceBaseUrl: 'https://process.example.com',
      }),
    ).rejects.toThrow(/anti-wipe/i);
    expect(admin.deleted).toHaveLength(0);
  });

  it("ne supprime rien si la source est injoignable (propage l'erreur avant delete)", async () => {
    const admin = fakeAdmin([
      { source_fiche_id: '1', content_hash: 'h1', detail_hash: 'd-1' },
    ]);
    await expect(
      syncProcessIndex({
        fetchSource: async () => {
          throw new Error('source down');
        },
        embedMany: async () => [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        admin: admin as any,
        sourceBaseUrl: 'https://process.example.com',
      }),
    ).rejects.toThrow('source down');
    expect(admin.deleted).toHaveLength(0);
    expect(admin.upserted).toHaveLength(0);
  });

  it('re-traite la fiche quand detail_hash change (upsert detail + embedding présent)', async () => {
    const f = {
      fiche_id: '1',
      mission_code: 'B',
      mission_nom: 'M',
      fiche_code: 'B-1',
      titre: 'F',
      priorite: 'P1',
      contenu: 'c1',
      content_hash: 'h1',
      detail: {
        mission: { code: 'B', nom: 'M' },
        fiche: {
          code: 'B-1',
          titre: 'F',
          description: null,
          priorite: 'P1',
          statut: 'actif',
        },
        taches: [],
      },
      detail_hash: 'd2-NEW',
    };
    const admin = fakeAdmin([
      { source_fiche_id: '1', content_hash: 'h1', detail_hash: 'd1-OLD' },
    ]);
    const embedMany = vi.fn(async (t: string[]) => t.map(() => [0.1, 0.2]));
    const res = await syncProcessIndex({
      fetchSource: async () => [f],
      embedMany,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin: admin as any,
      sourceBaseUrl: 'https://p',
    });
    expect(admin.upserted).toHaveLength(1);
    expect(admin.upserted[0].detail_hash).toBe('d2-NEW');
    expect(admin.upserted[0].detail).toBeDefined();
    expect(admin.upserted[0].embedding).toEqual([0.1, 0.2]);
    expect(res.upserted).toBe(1);
  });
});
