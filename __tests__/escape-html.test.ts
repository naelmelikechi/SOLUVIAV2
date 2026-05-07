import { describe, it, expect } from 'vitest';
import { escapeHtml } from '@/lib/utils/escape-html';

describe('escapeHtml', () => {
  it('escapes les caracteres HTML reserves', () => {
    // Au sprint 5 #14 on a retire / ` = du set : / cassait les URLs
    // dans le fallback texte des emails sans gain securite reel.
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('escapes les guillemets pour les contextes attribut', () => {
    expect(escapeHtml('"><img src=x onerror=alert(1)>')).toBe(
      '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;',
    );
  });

  it('passe-plat sur / ` = (sprint 5 #14 : retires du set)', () => {
    expect(escapeHtml('https://example.com/path?a=1&b=2')).toBe(
      'https://example.com/path?a=1&amp;b=2',
    );
    expect(escapeHtml('`code`')).toBe('`code`');
  });

  it('escape les apostrophes', () => {
    expect(escapeHtml("L'équipe d'admin")).toBe('L&#39;équipe d&#39;admin');
  });

  it('escape les esperluettes en premier (avoid double escaping)', () => {
    expect(escapeHtml('AT&T')).toBe('AT&amp;T');
    // Already-escaped entities sont re-escaped (escape brut, pas html-aware)
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  it('passe-plat sur les chaines benignes', () => {
    expect(escapeHtml('Bonjour Nael Melikechi')).toBe('Bonjour Nael Melikechi');
    expect(escapeHtml('FAC-DUP-0042')).toBe('FAC-DUP-0042');
  });

  it('gere null/undefined comme chaine vide', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('coerce les non-strings en strings', () => {
    expect(escapeHtml(42 as unknown as string)).toBe('42');
  });
});
