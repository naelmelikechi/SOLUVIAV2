import { generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { env } from '@/lib/env';
import type { NoteAnalysis } from './types';
import type { FinalizedFiche } from '@/lib/process/types';

// IDs modèles Anthropic. À confirmer contre la version installée de
// @ai-sdk/anthropic au moment de l'implémentation (cf. node_modules).
export const INGEST_MODEL = 'claude-haiku-4-5';
export const ANSWER_MODEL = 'claude-sonnet-5';

const NoteAnalysisSchema = z.object({
  title: z.string().max(120),
  summary: z.string().max(600),
  key_points: z.array(z.string()).max(12),
  entities: z.array(z.string()).max(15),
  aliases: z.array(z.string()).max(6),
  tags: z.array(z.string()).max(8),
});

export function anthropic() {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing');
  return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

const SYSTEM = `Tu analyses des fiches de process internes d'un organisme de formation (Soluvia) pour bâtir une base de connaissance.
Produis, en français, une synthèse réutilisable : titre clair, résumé (2-4 phrases), points clés actionnables, entités citées (OPCO, codes de ticket, missions, outils, livrables), alias/synonymes utiles pour la recherche, tags courts.
Synthétise, ne recopie pas. N'invente rien.`;

/** Analyse une fiche en note structurée. Lève si ANTHROPIC_API_KEY absent. */
export async function analyzeFiche(
  fiche: FinalizedFiche,
): Promise<NoteAnalysis> {
  const { object } = await generateObject({
    model: anthropic()(INGEST_MODEL),
    schema: NoteAnalysisSchema,
    system: SYSTEM,
    prompt: `Fiche ${fiche.fiche_code} — ${fiche.titre} (mission ${fiche.mission_nom}) :\n\n${fiche.contenu.slice(0, 12000)}`,
  });
  return object;
}
