import { type NextRequest, NextResponse } from 'next/server';
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { env } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import {
  retrieveContext,
  buildChatMessages,
  lastUserQuestion,
  type ChatMsg,
} from '@/lib/process/rag';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function isChatMsg(m: unknown): m is ChatMsg {
  return (
    !!m &&
    typeof m === 'object' &&
    ((m as { role?: unknown }).role === 'user' ||
      (m as { role?: unknown }).role === 'assistant') &&
    typeof (m as { content?: unknown }).content === 'string'
  );
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    messages?: unknown;
    question?: string;
  };

  // Rétro-compat : accepte l'ancien format { question } en plus du nouveau { messages }.
  let messages: ChatMsg[];
  if (Array.isArray(body.messages)) {
    if (!body.messages.every(isChatMsg))
      return NextResponse.json({ error: 'invalid_messages' }, { status: 400 });
    messages = body.messages;
  } else if (typeof body.question === 'string' && body.question.trim()) {
    messages = [{ role: 'user', content: body.question }];
  } else {
    return NextResponse.json({ error: 'invalid_messages' }, { status: 400 });
  }

  if (messages.length === 0)
    return NextResponse.json({ error: 'invalid_messages' }, { status: 400 });

  // Borne le payload complet (pas seulement le dernier message) pour éviter
  // un historique surdimensionné (coût tokens / abus).
  if (messages.length > 30)
    return NextResponse.json({ error: 'too_many_messages' }, { status: 400 });
  if (messages.some((m) => m.content.length > 6000))
    return NextResponse.json({ error: 'message_too_long' }, { status: 400 });

  const question = lastUserQuestion(messages);
  if (!question.trim())
    return NextResponse.json({ error: 'empty_question' }, { status: 400 });
  if (question.length > 2000)
    return NextResponse.json({ error: 'question_too_long' }, { status: 400 });
  if (!env.OPENAI_API_KEY)
    return NextResponse.json({ error: 'ai_not_configured' }, { status: 503 });

  const fiches = await retrieveContext(question, { admin: supabase });
  const sources = fiches.map((f) => ({
    source_fiche_id: f.source_fiche_id,
    titre: f.titre,
    mission: f.mission,
    url: f.url,
  }));

  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  const { system, messages: modelMsgs } = buildChatMessages(messages, fiches);
  const result = streamText({
    model: openai('gpt-4o-mini'),
    system,
    // `ChatMsg` (role/content) est directement assignable à `ModelMessage[]`
    // côté ai v6 (streamText accepte { role: 'user'|'assistant', content }) :
    // aucun mapping runtime nécessaire.
    messages: modelMsgs,
    temperature: 0.2,
  });

  // Réponse en flux (corps) + sources (header, encodé pour supporter les accents).
  return result.toTextStreamResponse({
    headers: {
      'x-process-sources': encodeURIComponent(JSON.stringify(sources)),
    },
  });
}
