import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    question?: string;
    answer?: string;
    rating?: number;
    sources?: unknown;
  };

  const question = (body.question ?? '').trim();
  const answer = (body.answer ?? '').trim();
  const rating = body.rating;

  if (!question || !answer)
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  if (rating !== -1 && rating !== 1)
    return NextResponse.json({ error: 'invalid_rating' }, { status: 400 });

  const { error } = await supabase.from('process_qa_feedback').insert({
    user_id: user.id,
    question,
    answer,
    rating,
    sources: (body.sources ?? null) as never,
  });

  if (error) {
    logger.error('process/feedback', 'Insertion du feedback échouée', {
      error,
    });
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
