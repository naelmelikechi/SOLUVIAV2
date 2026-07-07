import { describe, it, expect } from 'vitest';
import { parseDateOnly } from './dates';

describe('parseDateOnly', () => {
  it('retourne le début de journée pour une date ISO', () => {
    const d = parseDateOnly('2026-06-24');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // juin = 5
    expect(d.getDate()).toBe(24);
    expect(d.getHours()).toBe(0);
  });
});
