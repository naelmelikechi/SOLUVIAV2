import { type NextRequest, NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { env } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const FollowupsSchema = z.object({
  suggestions: z.array(z.string()),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { question, answer } = (await req.json().catch(() => ({}))) as {
    question?: string;
    answer?: string;
  };
  const q = (question ?? '').trim();
  const a = (answer ?? '').trim();
  if (!q || !a) return NextResponse.json({ suggestions: [] });

  if (!env.OPENAI_API_KEY) return NextResponse.json({ suggestions: [] });

  try {
    const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: FollowupsSchema,
      prompt: `À partir de cette Q/R sur les process internes Soluvia, propose 3 questions de relance courtes et utiles (max ~8 mots), en français, sans redite.\nQ: ${q.slice(0, 2000)}\nR: ${a.slice(0, 6000)}`,
    });
    // Le schéma n'impose plus de `.max(3)` (sinon un output à 4+ items serait
    // entièrement rejeté) : on borne côté réponse.
    return NextResponse.json({ suggestions: object.suggestions.slice(0, 3) });
  } catch (err) {
    logger.warn('process/followups', 'Génération des relances échouée', {
      error: err,
    });
    return NextResponse.json({ suggestions: [] });
  }
}
