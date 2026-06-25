import { describe, it, expect } from 'vitest';
import { serializeError } from '@/lib/utils/logger';

describe('serializeError', () => {
  it('preserves Error name, message and stack', () => {
    const e = new TypeError('fetch failed');
    const out = serializeError(e);
    expect(out?.name).toBe('TypeError');
    expect(out?.message).toBe('fetch failed');
    expect(out?.stack).toBeTruthy();
    expect(out?.code).toBeUndefined();
  });

  it('captures a string `code` on an Error', () => {
    const e = Object.assign(new Error('boom'), { code: 'PGRST303' });
    expect(serializeError(e)?.code).toBe('PGRST303');
  });

  it('extracts message/code from a PostgREST-shaped plain object (no [object Object])', () => {
    // Reproduces SOLUVIA-1M: a non-Error object reaching the logger.
    const pgErr = {
      message: 'JWT issued at future',
      code: 'PGRST303',
      details: 'clock skew',
      hint: 'sync NTP',
    };
    const out = serializeError(pgErr);
    expect(out?.message).not.toBe('[object Object]');
    expect(out?.message).toContain('JWT issued at future');
    expect(out?.message).toContain('clock skew');
    expect(out?.message).toContain('sync NTP');
    expect(out?.code).toBe('PGRST303');
  });

  it('JSON-stringifies a non-Error object that has no message field', () => {
    const out = serializeError({ foo: 'bar', n: 1 });
    expect(out?.message).not.toBe('[object Object]');
    expect(out?.message).toBe('{"foo":"bar","n":1}');
  });

  it('uses the constructor name when the object is a class instance', () => {
    class PostgrestError {
      message = 'duplicate key';
      code = '23505';
    }
    const out = serializeError(new PostgrestError());
    expect(out?.name).toBe('PostgrestError');
    expect(out?.message).toContain('duplicate key');
    expect(out?.code).toBe('23505');
  });

  it('falls back to String() for primitives and null', () => {
    expect(serializeError('plain string')?.message).toBe('plain string');
    expect(serializeError(null)?.message).toBe('null');
    expect(serializeError(42)?.message).toBe('42');
  });
});
