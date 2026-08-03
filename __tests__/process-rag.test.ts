import { describe, it, expect } from 'vitest';
import { buildRagMessages } from '@/lib/process/rag';

describe('buildRagMessages', () => {
  const fiches = [
    {
      source_fiche_id: '1',
      titre: 'Facturation OPCO',
      mission: 'Facturation',
      url: '/process/fiches/1',
      contenu: 'Étapes de facturation OPCO...',
    },
  ];
  it('ancre le system prompt et inclut contexte + question', () => {
    const { system, prompt } = buildRagMessages(
      'comment facturer un OPCO ?',
      fiches as never,
    );
    expect(system.toLowerCase()).toContain('uniquement'); // ancrage
    expect(prompt).toContain('Facturation OPCO'); // contexte
    expect(prompt).toContain('Étapes de facturation OPCO'); // contenu
    expect(prompt).toContain('comment facturer un OPCO ?'); // question
  });
  it('gère un contexte vide', () => {
    const { prompt } = buildRagMessages('x', []);
    expect(prompt).toContain('x');
  });
});
