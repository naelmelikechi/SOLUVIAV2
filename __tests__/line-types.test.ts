import { describe, expect, it } from 'vitest';
import {
  WHITELIST_LINE_TYPES,
  BLACKLIST_LINE_TYPES,
  classifyLineType,
} from '@/lib/eduvia/line-types';

describe('classifyLineType', () => {
  it('PEDAGOGIE → whitelist', () => {
    expect(classifyLineType('PEDAGOGIE')).toBe('whitelist');
  });

  it('PREMIEREQUIPEMENT → blacklist', () => {
    expect(classifyLineType('PREMIEREQUIPEMENT')).toBe('blacklist');
  });

  it('type inconnu → unknown', () => {
    expect(classifyLineType('EXAMEN')).toBe('unknown');
    expect(classifyLineType('RQTH')).toBe('unknown');
    expect(classifyLineType('')).toBe('unknown');
  });

  it('listes hardcodées documentées et figées', () => {
    expect(WHITELIST_LINE_TYPES).toEqual(['PEDAGOGIE']);
    expect(BLACKLIST_LINE_TYPES).toEqual(['PREMIEREQUIPEMENT']);
  });
});
