import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCipheriv, randomBytes } from 'crypto';

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { encryptApiKey, decryptApiKey } from '@/lib/utils/encryption';

const HEX_KEY = 'a'.repeat(64); // 64 chars hex = 32 octets (256 bits)

describe('encryptApiKey / decryptApiKey roundtrip', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = HEX_KEY;
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

  it('throws when ENCRYPTION_KEY is too short for hex (< 64 chars)', () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(32);
    expect(() => encryptApiKey('x')).toThrow(/ENCRYPTION_KEY/);
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

describe('decryptApiKey legacy fallback (post-fix C2)', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = HEX_KEY;
  });

  it('decrypts payloads encrypted with the legacy utf-8 truncated key', () => {
    // Simule l'ancienne logique : Buffer.from(raw.slice(0, 32), 'utf-8')
    const legacyKey = Buffer.from(HEX_KEY.slice(0, 32), 'utf-8');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', legacyKey, iv, {
      authTagLength: 16,
    });
    let enc = cipher.update('legacy-secret', 'utf-8', 'hex');
    enc += cipher.final('hex');
    const tag = cipher.getAuthTag();
    const payload = `${iv.toString('hex')}:${tag.toString('hex')}:${enc}`;

    expect(decryptApiKey(payload)).toBe('legacy-secret');
  });

  it('throws when neither current nor legacy key works', () => {
    process.env.ENCRYPTION_KEY = HEX_KEY;
    const otherKey = Buffer.from('b'.repeat(64), 'hex');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', otherKey, iv, {
      authTagLength: 16,
    });
    let enc = cipher.update('x', 'utf-8', 'hex');
    enc += cipher.final('hex');
    const tag = cipher.getAuthTag();
    const payload = `${iv.toString('hex')}:${tag.toString('hex')}:${enc}`;

    expect(() => decryptApiKey(payload)).toThrow(
      /Impossible de déchiffrer|clé/i,
    );
  });
});
