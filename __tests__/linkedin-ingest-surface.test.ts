import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Garde-fou de surface (Chantier 1 securite).
 *
 * `ingestLinkedinEvent` ecrit en service-role sans garde d'auth. Tant qu'il
 * vivait dans un module `'use server'`, il etait enregistre comme Server Action
 * -> invocable par un POST direct sur l'endpoint d'action, contournant le secret
 * du webhook. Ce test bloque la regression : l'ingestion doit rester hors du
 * perimetre `'use server'` et aucun `createAdminClient` ne doit subsister dans
 * le module d'actions.
 */

// `@/lib/actions/linkedin` importe la chaine guards -> supabase/server ->
// next/headers. On la neutralise : le test n'exerce que la SURFACE d'export.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import * as actions from '@/lib/actions/linkedin';
import { ingestLinkedinEvent } from '@/lib/linkedin/ingest';

describe('surface LinkedIn ingest', () => {
  it("ingestLinkedinEvent n'est plus exporte par le module 'use server'", () => {
    expect(
      (actions as Record<string, unknown>).ingestLinkedinEvent,
    ).toBeUndefined();
  });

  it('ingestLinkedinEvent vit dans le module non-action lib/linkedin/ingest', () => {
    expect(typeof ingestLinkedinEvent).toBe('function');
  });

  it("lib/actions/linkedin.ts ne fait plus de createAdminClient (service-role hors 'use server')", () => {
    const src = readFileSync('lib/actions/linkedin.ts', 'utf8');
    expect(src).not.toContain('createAdminClient');
  });
});
