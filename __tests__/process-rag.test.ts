import { describe, it, expect } from 'vitest';
import {
  buildRagMessages,
  buildChatMessages,
  lastUserQuestion,
  type ChatMsg,
} from '@/lib/process/rag';

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

describe('buildChatMessages', () => {
  const fiches = [
    {
      source_fiche_id: '1',
      titre: 'Facturation OPCO',
      mission: 'Facturation',
      url: '/process/fiches/1',
      contenu: 'Étapes de facturation OPCO...',
    },
  ];
  const history: ChatMsg[] = [
    { role: 'user', content: 'comment facturer un OPCO ?' },
    { role: 'assistant', content: 'Voir la fiche [1].' },
    { role: 'user', content: 'et si le client est en retard ?' },
  ];

  it('ancre le system prompt et inclut le contexte numéroté', () => {
    const { system, messages } = buildChatMessages(history, fiches as never);
    expect(system.toLowerCase()).toContain('uniquement'); // ancrage
    const preface = messages[0];
    expect(preface?.role).toBe('user');
    expect(preface?.content).toContain('[1] Facturation · Facturation OPCO'); // contexte numéroté
    expect(preface?.content).toContain('Étapes de facturation OPCO'); // contenu
  });

  it("inclut l'historique complet après le préambule", () => {
    const { messages } = buildChatMessages(history, fiches as never);
    expect(messages.length).toBe(history.length + 1);
    expect(messages.slice(1)).toEqual(history);
  });

  it('gère un contexte vide', () => {
    const { messages } = buildChatMessages(history, []);
    expect(messages[0]?.content).toContain('aucun process finalisé disponible');
  });
});

describe('lastUserQuestion', () => {
  const history: ChatMsg[] = [
    { role: 'user', content: 'comment facturer un OPCO ?' },
    { role: 'assistant', content: 'Voir la fiche [1].' },
    { role: 'user', content: 'et si le client est en retard ?' },
  ];

  it('renvoie le dernier message user', () => {
    expect(lastUserQuestion(history)).toBe('et si le client est en retard ?');
  });

  it('ignore les messages assistant en fin de liste', () => {
    const h: ChatMsg[] = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'r1' },
    ];
    expect(lastUserQuestion(h)).toBe('q1');
  });

  it('renvoie une chaîne vide si aucun message user', () => {
    expect(lastUserQuestion([])).toBe('');
    expect(lastUserQuestion([{ role: 'assistant', content: 'x' }])).toBe('');
  });
});
