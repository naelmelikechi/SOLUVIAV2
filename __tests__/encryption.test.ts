import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { encryptApiKey, decryptApiKey } from '@/lib/utils/encryption';

describe('encryptApiKey / decryptApiKey roundtrip', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(32);
  });

  it('roundtrips a plaintext through AES-256-GCM', () => {
    const plaintext = 'sk_live_abc123_top_secret';
    const enc = encryptApiKey(plaintext);
    expect(enc).not.toBe(plaintext);
    expect(decryptApiKey(enc)).toBe(plaintext);
  });

  it('produces a different ciphertext on each call (random IV)', () => {
    const a = encryptApiKey('hello');
    const b = encryptApiKey('hello');
    expect(a).not.toBe(b);
    expect(decryptApiKey(a)).toBe('hello');
    expect(decryptApiKey(b)).toBe('hello');
  });

  it('uses the iv:authTag:ciphertext hex layout', () => {
    const enc = encryptApiKey('whatever');
    const parts = enc.split(':');
    expect(parts).toHaveLength(3);
    for (const p of parts) {
      expect(p).toMatch(/^[0-9a-f]+$/);
    }
  });

  it('throws when ENCRYPTION_KEY is unset', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptApiKey('x')).toThrow(/ENCRYPTION_KEY/);
    expect(() => decryptApiKey('a:b:c')).toThrow(/ENCRYPTION_KEY/);
  });

  it('throws when the encrypted payload has the wrong shape', () => {
    expect(() => decryptApiKey('not-three-parts')).toThrow(/Format/);
  });

  it('throws when the auth tag is tampered (GCM integrity)', () => {
    const enc = encryptApiKey('integrity-check');
    const [iv, , ciphertext] = enc.split(':');
    const forged = `${iv}:${'00'.repeat(16)}:${ciphertext}`;
    expect(() => decryptApiKey(forged)).toThrow();
  });
});
