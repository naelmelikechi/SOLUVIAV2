import { timingSafeEqual } from 'crypto';

/**
 * Constant-time comparison of two secrets (tokens, bearer headers).
 *
 * Prevents timing attacks where an attacker measures response latency to
 * recover a secret byte-by-byte. A plain `a !== b` short-circuits on the
 * first differing byte and leaks that position; `timingSafeEqual` always
 * scans the full buffer.
 *
 * A length mismatch returns false immediately (the length of a secret is not
 * itself sensitive, and `timingSafeEqual` throws on unequal-length buffers).
 * Non-string / nullish input returns false rather than throwing.
 */
export function timingSafeStrEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
