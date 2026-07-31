import { describe, it, expect } from 'vitest';
import {
  stripMarkdown,
  formatEcheance,
  missionInitials,
} from '@/lib/process/format';

describe('stripMarkdown', () => {
  it('retire gras/emphase/titres/liens et compacte', () => {
    expect(stripMarkdown('**MA saturé** et _R6223-22_')).toBe(
      'MA saturé et R6223-22',
    );
    expect(stripMarkdown('## Titre\n\n- point 1\n- point 2')).toBe(
      'Titre point 1 point 2',
    );
    expect(stripMarkdown('voir [le doc](http://x) ici')).toBe(
      'voir le doc ici',
    );
    expect(stripMarkdown('emoji 📄 gardé')).toContain('gardé');
  });
});
describe('formatEcheance', () => {
  it('formate une date ISO en FR long', () => {
    expect(formatEcheance('2026-06-26')).toBe('26 juin 2026');
  });
  it('null → null', () => {
    expect(formatEcheance(null)).toBeNull();
  });
});
describe('missionInitials', () => {
  it('prend 2 initiales', () => {
    expect(missionInitials('Leslie Gangemi')).toBe('LG');
  });
  it('null → tiret', () => {
    expect(missionInitials(null)).toBe('—');
  });
});
