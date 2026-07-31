import { describe, it, expect } from 'vitest';
import { buildSnippet } from '@/lib/process/snippet';

describe('buildSnippet', () => {
  it('tronque un contenu long à la longueur demandée (+ ellipse)', () => {
    const contenu = 'a'.repeat(500);
    const snip = buildSnippet(contenu, 'rien', 120);
    expect(snip.length).toBeLessThanOrEqual(121);
    expect(snip.endsWith('…')).toBe(true);
  });
  it('centre autour du premier mot de la requête trouvé, sans dépasser maxLen+1', () => {
    const contenu = 'x'.repeat(200) + 'PROCEDURE_CIBLE' + 'x'.repeat(200);
    const snip = buildSnippet(contenu, 'procedure_cible', 80);
    expect(snip.toLowerCase()).toContain('procedure_cible');
    expect(snip.length).toBeLessThanOrEqual(81);
    expect(snip.startsWith('…')).toBe(true);
  });
  it("renvoie le contenu tel quel s'il est plus court que la longueur", () => {
    expect(buildSnippet('court', 'x', 80)).toBe('court');
  });
  it('nettoie le markdown (pas de "**" dans le snippet)', () => {
    expect(
      buildSnippet('**gras** ' + 'x'.repeat(300), 'gras', 80),
    ).not.toContain('**');
  });
});
