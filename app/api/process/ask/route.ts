import { type NextRequest, NextResponse } from 'next/server';
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { env } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { retrieveContext, buildRagMessages } from '@/lib/process/rag';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { question } = (await req.json().catch(() => ({}))) as {
    question?: string;
  };
  const q = (question ?? '').trim();
  if (!q)
    return NextResponse.json({ error: 'empty_question' }, { status: 400 });
  if (q.length > 2000)
    return NextResponse.json({ error: 'question_too_long' }, { status: 400 });
  if (!env.OPENAI_API_KEY)
    return NextResponse.json({ error: 'ai_not_configured' }, { status: 503 });

  const fiches = await retrieveContext(q, { admin: supabase });
  const sources = fiches.map((f) => ({
    source_fiche_id: f.source_fiche_id,
    titre: f.titre,
    mission: f.mission,
    url: f.url,
  }));

  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  const { system, prompt } = buildRagMessages(q, fiches);
  const result = streamText({
    model: openai('gpt-4o-mini'),
    system,
    prompt,
    temperature: 0.2,
  });

  // Réponse en flux (corps) + sources (header, encodé pour supporter les accents).
  return result.toTextStreamResponse({
    headers: {
      'x-process-sources': encodeURIComponent(JSON.stringify(sources)),
    },
  });
}
