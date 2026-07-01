// Set required env BEFORE any import that loads @/lib/env (zod-validated).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi } from 'vitest';

/**
 * Tests des helpers de curseur keyset (encodeCursor / decodeCursor) de
 * lib/queries/factures.ts : round-trip + rejet zod sans throw.
 */

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { encodeCursor, decodeCursor } from '@/lib/queries/factures';

describe('curseur keyset', () => {
  it('round-trip : decodeCursor(encodeCursor(x)) === x', () => {
    const x = { s: 42, i: '11111111-1111-4111-8111-111111111111' };
    expect(decodeCursor(encodeCursor(x))).toEqual(x);
  });

  it('decodeCursor(garbage) === undefined (zod rejette sans throw)', () => {
    expect(decodeCursor('garbage')).toBeUndefined();
  });

  it('decodeCursor(null) === undefined', () => {
    expect(decodeCursor(null)).toBeUndefined();
  });

  it('decodeCursor rejette une forme valide base64 mais mauvais schema', () => {
    const bad = Buffer.from(JSON.stringify({ s: 'x', i: 1 })).toString(
      'base64url',
    );
    expect(decodeCursor(bad)).toBeUndefined();
  });
});
