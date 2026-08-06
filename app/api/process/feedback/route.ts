import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { Json } from '@/types/database';

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
  if (question.length > 4000 || answer.length > 20000)
    return NextResponse.json({ error: 'too_long' }, { status: 400 });
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

  // Un 👎 ouvre une lacune dans la file de revue (/admin/cerveau) : c'est là que
  // l'admin écrit la bonne réponse, qui devient une note du cerveau. Insertion
  // via le client admin car la RLS de brain_proposals est admin-only et l'auteur
  // du 👎 ne l'est pas. Best-effort : un échec ici ne doit pas perdre le feedback,
  // le prochain `brain:ingest` rattrape les 👎 sans proposition.
  if (rating === -1) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const { createHash } = await import('node:crypto');
      const admin = createAdminClient();
      const { data: fb } = await admin
        .from('process_qa_feedback')
        .select('id')
        .eq('user_id', user.id)
        .eq('question', question)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fb) {
        await admin.from('brain_proposals').upsert(
          {
            kind: 'lacune',
            status: 'en_attente',
            target_path: null,
            payload: {
              question,
              answer_ko: answer,
              derived_from: [],
              source_hashes: {},
            } as unknown as Json,
            source_ref: fb.id,
            source_hash: createHash('sha256')
              .update(`${question}|${answer}`)
              .digest('hex'),
          },
          { onConflict: 'kind,source_ref' },
        );
      }
    } catch (e) {
      logger.error('process/feedback', 'Ouverture de la lacune échouée', {
        error: e,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
