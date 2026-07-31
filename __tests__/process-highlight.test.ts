import { describe, it, expect } from 'vitest';
import { splitHighlight } from '@/components/process/process-highlight';

describe('splitHighlight', () => {
  it('surligne un terme trouvé (>=3 lettres)', () => {
    const segs = splitHighlight('comment facturer', 'facturer');
    const hit = segs.find((s) => s.hit);
    expect(hit).toBeDefined();
    expect(hit?.text.toLowerCase()).toBe('facturer');
  });

  it('ignore les termes de moins de 3 lettres', () => {
    const segs = splitHighlight('un test ici', 'un');
    expect(segs.every((s) => !s.hit)).toBe(true);
    expect(segs.map((s) => s.text).join('')).toBe('un test ici');
  });

  it('aucune correspondance -> un seul segment non surligné', () => {
    const segs = splitHighlight('bonjour tout le monde', 'xyz');
    expect(segs).toEqual([{ text: 'bonjour tout le monde', hit: false }]);
  });

  it('est insensible à la casse', () => {
    const segs = splitHighlight('Facturation OPCO', 'facturation');
    expect(segs.some((s) => s.hit && s.text === 'Facturation')).toBe(true);
  });

  it('échappe les caractères spéciaux regex de la requête', () => {
    const segs = splitHighlight('R6223-22 (article)', 'R6223-22');
    expect(() => segs).not.toThrow();
    expect(segs.some((s) => s.hit)).toBe(true);
  });

  it('reconstruit le texte original en concaténant les segments', () => {
    const text = "que faire si le mandat n'est pas conforme";
    const segs = splitHighlight(text, 'mandat conforme');
    expect(segs.map((s) => s.text).join('')).toBe(text);
  });

  it('chaîne vide -> tableau vide', () => {
    expect(splitHighlight('', 'test')).toEqual([]);
  });
});
