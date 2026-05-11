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

const SYSTEM_PROMPT = `Tu es l'assistant de triage des bugs de SOLUVIA, une application
de gestion pour organismes de formation francais (CRM, facturation, suivi
qualite, time tracking, projets de formation, factures vers Odoo,
synchronisation Eduvia). Les utilisateurs sont des admins ou des chefs de
projet (CDP). Stack : Next.js 16 + Supabase + TailwindCSS.

A partir du rapport d'un utilisateur, produis un triage structure:
- severity: severite reelle du bug en partant du commentaire, du screenshot
  et de la severite ressentie par l'utilisateur. "critical" si bloquant
  pour tous les users ou perte de donnees; "high" si bloquant pour un
  user; "medium" si genant mais contournable; "low" si cosmetique.
- category: categorie principale (ui, data, auth, perf, email, pdf,
  navigation, permissions, autre).
- summary: 1-2 phrases qui resument le bug pour un developpeur, en
  francais, sans em-dash.
- hypotheses: 1 a 5 hypotheses techniques de cause probable, classees
  par probabilite. Concis, en francais, en pointant le code/feature
  suspect quand possible.`;

/**
 * Analyse un bug report (commentaire + screenshot + contexte) et retourne
 * un triage structure. Lance si OPENAI_API_KEY absent ou si l'appel echoue.
 * L'appelant gere les erreurs et marque ai_status = 'failed' / 'skipped'.
 */
export async function triageBugReport(input: TriageInput): Promise<Triage> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing');
  }

  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

  const consoleErrorsStr =
    input.consoleErrors && Array.isArray(input.consoleErrors)
      ? JSON.stringify(input.consoleErrors).slice(0, 2000)
      : 'aucune';

  const userText = [
    `Role: ${input.userRole}`,
    `Page: ${input.pageUrl}`,
    `User-Agent: ${input.userAgent ?? 'inconnu'}`,
    `Sentry event id: ${input.sentryEventId ?? 'aucun'}`,
    `Severite ressentie: ${input.perceivedSeverity ?? 'non precisee'}`,
    `Erreurs console recentes: ${consoleErrorsStr}`,
    '',
    `Commentaire de l'utilisateur:`,
    input.comment,
  ].join('\n');

  const userContent: Array<
    { type: 'text'; text: string } | { type: 'image'; image: URL }
  > = [{ type: 'text', text: userText }];

  if (input.screenshotUrl) {
    userContent.push({ type: 'image', image: new URL(input.screenshotUrl) });
  }

  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: TriageSchema,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  return object;
}
