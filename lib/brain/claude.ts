import { generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { env } from '@/lib/env';
import type { NoteAnalysis } from './types';
import type { FinalizedFiche } from '@/lib/process/types';

// IDs modèles Anthropic (validés contre @ai-sdk/anthropic@3 : isKnownModel).
export const INGEST_MODEL = 'claude-haiku-4-5';
export const ANSWER_MODEL = 'claude-sonnet-5';

// Bornes appliquées APRÈS génération (clamp), pas dans le schéma : le provider
// retire les contraintes max du json_schema envoyé au modèle, donc les garder
// dans zod ne ferait qu'échouer localement (NoObjectGeneratedError) si le
// modèle dépasse — une fiche riche ne serait alors JAMAIS ingérée, en silence.
const CAPS = {
  title: 120,
  summary: 600,
  key_points: 12,
  entities: 15,
  aliases: 6,
  tags: 8,
} as const;

const NoteAnalysisSchema = z.object({
  title: z.string(),
  summary: z.string(),
  key_points: z.array(z.string()),
  entities: z.array(z.string()),
  aliases: z.array(z.string()),
  tags: z.array(z.string()),
});

export function anthropic() {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing');
  return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

const SYSTEM = `Tu analyses des fiches de process internes d'un organisme de formation (Soluvia) pour bâtir une base de connaissance.
Produis, en français, une synthèse réutilisable : titre clair (max 120 caractères), résumé de 2-4 phrases (max 600 caractères), jusqu'à 12 points clés actionnables, jusqu'à 15 entités citées (OPCO, codes de ticket, missions, outils, livrables), jusqu'à 6 alias/synonymes utiles pour la recherche, jusqu'à 8 tags courts.
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
  // Clamp de sécurité (cf. CAPS) : borne le résultat sans jamais faire échouer
  // l'ingestion si le modèle dépasse.
  return {
    title: object.title.slice(0, CAPS.title),
    summary: object.summary.slice(0, CAPS.summary),
    key_points: object.key_points.slice(0, CAPS.key_points),
    entities: object.entities.slice(0, CAPS.entities),
    aliases: object.aliases.slice(0, CAPS.aliases),
    tags: object.tags.slice(0, CAPS.tags),
  };
}
