import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formatPercent,
  formatHeures,
} from '@/lib/utils/formatters';

describe('formatCurrency', () => {
  it('formats integer amounts in EUR with French separators', () => {
    expect(formatCurrency(1234)).toMatch(/1\s?234\s?€/);
  });
  it('keeps up to 2 decimals when present (no trailing zero)', () => {
    expect(formatCurrency(1234.5)).toMatch(/1\s?234,5\s?€/);
    expect(formatCurrency(1234.56)).toMatch(/1\s?234,56\s?€/);
  });
  it('handles zero and negative amounts', () => {
    expect(formatCurrency(0)).toMatch(/0\s?€/);
    expect(formatCurrency(-42)).toMatch(/-/);
  });
});

describe('formatDate', () => {
  it('formats an ISO date string in French short form', () => {
    expect(formatDate('2026-04-29')).toMatch(/29\s+\S+\s+2026/);
  });
  it('accepts a Date instance', () => {
    expect(formatDate(new Date('2026-01-15T00:00:00Z'))).toMatch(/janv\.?/);
  });
});

describe('formatPercent', () => {
  it('rounds to nearest integer and appends %', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(50.4)).toBe('50%');
    expect(formatPercent(50.6)).toBe('51%');
    expect(formatPercent(100)).toBe('100%');
  });
});

describe('formatHeures', () => {
  it('renders zero/invalid as "0h"', () => {
    expect(formatHeures(0)).toBe('0h');
    expect(formatHeures(-1)).toBe('0h');
    expect(formatHeures(NaN)).toBe('0h');
  });
  it('renders whole hours without minutes', () => {
    expect(formatHeures(7)).toBe('7h');
  });
  it('renders fractional hours as "Hh MM" with zero-padding', () => {
    expect(formatHeures(7.5)).toBe('7h30');
    expect(formatHeures(7.25)).toBe('7h15');
    expect(formatHeures(7.05)).toBe('7h03');
  });
  it('rolls 60 minutes up to the next hour', () => {
    // 7h 59.7min → Math.round(0.995 × 60) = 60 → roll-over → 8h
    expect(formatHeures(7.995)).toBe('8h');
  });
});
