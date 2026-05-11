import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { env } from '@/lib/env';

export const TriageSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  category: z.enum([
    'ui',
    'data',
    'auth',
    'perf',
    'email',
    'pdf',
    'navigation',
    'permissions',
    'autre',
  ]),
  summary: z.string().max(280),
  hypotheses: z.array(z.string()).max(5),
});

export type Triage = z.infer<typeof TriageSchema>;

export interface TriageInput {
  comment: string;
  perceivedSeverity: 'genant' | 'bloquant' | 'critique' | null;
  pageUrl: string;
  userRole: string;
  userAgent: string | null;
  consoleErrors: unknown;
  sentryEventId: string | null;
  screenshotUrl: string | null;
}

// Prompt court pour minimiser le cout token. Le contexte produit est
// suffisant pour gpt-4o-mini ; pas besoin de detailler la stack ou les
// regles metier.
const SYSTEM_PROMPT = `Tu tries les bugs d'une app SaaS francaise (Next.js + Supabase) pour organismes de formation.
Severite: critical (perte donnees / bloquant tous), high (bloquant 1 user), medium (genant contournable), low (cosmetique).
Categorie: ui, data, auth, perf, email, pdf, navigation, permissions, autre.
Summary: 1-2 phrases en francais sans em-dash.
Hypotheses: 1 a 5 causes techniques probables, concises, classees par probabilite.`;

/**
 * Analyse un bug report (commentaire + screenshot + contexte) et retourne
 * un triage structure. Lance si OPENAI_API_KEY absent ou si l'appel echoue.
 *
 * Optimisation tokens : on envoie l'image en `detail: low` (OpenAI la
 * redimensionne a 512x512 et facture forfait ~85 tokens au lieu de
 * ~1000+ en `high`). Suffisant pour identifier le contexte visuel
 * d'un bug. Cout : ~$0.0003 / requete.
 */
export async function triageBugReport(input: TriageInput): Promise<Triage> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing');
  }

  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

  // Console errors : on tronque agressivement pour ne pas exploser les
  // tokens si l'app a un boucle qui spam des erreurs.
  const consoleErrorsStr =
    input.consoleErrors && Array.isArray(input.consoleErrors)
      ? JSON.stringify(input.consoleErrors).slice(0, 800)
      : 'aucune';

  // Comment tronque a 1500 chars (au-dela : rare, et l'IA n'a pas besoin
  // de plus pour faire un triage utile).
  const trimmedComment = input.comment.slice(0, 1500);

  const userText = [
    `Page: ${input.pageUrl}`,
    `Severite ressentie: ${input.perceivedSeverity ?? 'non precisee'}`,
    `Erreurs console: ${consoleErrorsStr}`,
    '',
    `Commentaire utilisateur:`,
    trimmedComment,
  ].join('\n');

  type ImagePart = {
    type: 'image';
    image: URL;
    providerOptions?: { openai?: { imageDetail?: 'low' | 'high' | 'auto' } };
  };
  type TextPart = { type: 'text'; text: string };
  const userContent: Array<TextPart | ImagePart> = [
    { type: 'text', text: userText },
  ];

  if (input.screenshotUrl) {
    userContent.push({
      type: 'image',
      image: new URL(input.screenshotUrl),
      providerOptions: { openai: { imageDetail: 'low' } },
    });
  }

  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: TriageSchema,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  return object;
}
