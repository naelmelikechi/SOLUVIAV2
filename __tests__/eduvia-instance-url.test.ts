import { describe, it, expect } from 'vitest';

import { baseUrlFrom, normalizeEduviaInstanceUrl } from '@/lib/eduvia/client';

describe('normalizeEduviaInstanceUrl', () => {
  it('leaves a clean slug untouched', () => {
    expect(normalizeEduviaInstanceUrl('heol.eduvia.app')).toBe(
      'heol.eduvia.app',
    );
  });

  it('strips https:// prefix', () => {
    expect(normalizeEduviaInstanceUrl('https://heol.eduvia.app')).toBe(
      'heol.eduvia.app',
    );
  });

  it('strips http:// prefix', () => {
    expect(normalizeEduviaInstanceUrl('http://heol.eduvia.app')).toBe(
      'heol.eduvia.app',
    );
  });

  it('strips leading api. subdomain', () => {
    expect(normalizeEduviaInstanceUrl('api.heol.eduvia.app')).toBe(
      'heol.eduvia.app',
    );
  });

  it('strips https://api. combo', () => {
    expect(normalizeEduviaInstanceUrl('https://api.heol.eduvia.app')).toBe(
      'heol.eduvia.app',
    );
  });

  it('strips trailing /api/v1', () => {
    expect(normalizeEduviaInstanceUrl('heol.eduvia.app/api/v1')).toBe(
      'heol.eduvia.app',
    );
  });

  it('strips trailing /api/v1/status path', () => {
    expect(normalizeEduviaInstanceUrl('heol.eduvia.app/api/v1/status')).toBe(
      'heol.eduvia.app',
    );
  });

  it('strips trailing slash', () => {
    expect(normalizeEduviaInstanceUrl('heol.eduvia.app/')).toBe(
      'heol.eduvia.app',
    );
  });

  it('handles the full mess (https://api. + /api/v1)', () => {
    expect(
      normalizeEduviaInstanceUrl('https://api.heol.eduvia.app/api/v1'),
    ).toBe('heol.eduvia.app');
  });

  it('trims whitespace', () => {
    expect(normalizeEduviaInstanceUrl('  heol.eduvia.app  ')).toBe(
      'heol.eduvia.app',
    );
  });

  it('lowercases the result', () => {
    expect(normalizeEduviaInstanceUrl('HEOL.Eduvia.App')).toBe(
      'heol.eduvia.app',
    );
  });

  it('preserves hyphens in slug', () => {
    expect(normalizeEduviaInstanceUrl('heol-academy.eduvia.app')).toBe(
      'heol-academy.eduvia.app',
    );
  });

  it('returns empty string for empty input', () => {
    expect(normalizeEduviaInstanceUrl('')).toBe('');
  });
});

describe('baseUrlFrom (post-normalization)', () => {
  it('produces a single https://api. prefix even when input already has https://api.', () => {
    const normalized = normalizeEduviaInstanceUrl(
      'https://api.heol.eduvia.app/api/v1',
    );
    expect(baseUrlFrom(normalized)).toBe('https://api.heol.eduvia.app');
  });
});
