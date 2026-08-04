import type { ChatMsg } from '@/lib/process/rag';
import type { BrainNote } from './types';

const SYSTEM = `Tu es l'assistant des process internes de Soluvia (organisme de formation).
Réponds à la conversation en te basant UNIQUEMENT sur les notes fournies (numérotées [1], [2], …).
- Cite tes affirmations avec le numéro de la note source, ex. « … selon [1] ».
- Sois concret et actionnable ; structure (étapes, points clés) en markdown concis, en français.
- Si l'information n'est pas dans les notes, dis-le (« Je ne trouve pas cette information dans les process finalisés ») et n'invente rien.`;

/** Messages ancrés sur les notes du cerveau (même forme que buildChatMessages). */
export function buildBrainChatMessages(
  history: ChatMsg[],
  notes: BrainNote[],
): { system: string; messages: ChatMsg[] } {
  const contexte = notes.length
    ? notes.map((n, i) => `[${i + 1}] ${n.title}\n${n.body}`).join('\n\n')
    : '(aucune note disponible)';
  const preface: ChatMsg = {
    role: 'user',
    content: `Notes de connaissance disponibles (source des réponses) :\n\n${contexte}\n\n---\nUtilise ces notes pour répondre à la conversation ci-dessous.`,
  };
  return { system: SYSTEM, messages: [preface, ...history] };
}

/** Sources exposées à l'UI (mêmes champs que le RAG actuel). */
export function notesToSources(notes: BrainNote[]) {
  return notes.map((n) => ({
    source_fiche_id: n.source_ref ?? '',
    titre: n.title,
    mission: n.tags[0] ?? '',
    url: n.source_ref ? `/process/fiches/${n.source_ref}` : '/process',
  }));
}
