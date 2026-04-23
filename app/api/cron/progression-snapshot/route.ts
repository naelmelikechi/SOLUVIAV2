import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import { startOfWeek, format } from 'date-fns';

// CRON : snapshot hebdomadaire de la progression des apprenants.
// Exécuté chaque lundi matin. Source : contrats_progressions (remplie par le sync Eduvia).
// Cible : progression_snapshots_weekly, indexée par (contrat_id, semaine_debut).
// Utilisé en wave 3 pour calculer le nombre d'apprenants qui ont progressé
// de ≥ 2,5% d'une semaine sur l'autre.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const semaineDebut = format(
    startOfWeek(new Date(), { weekStartsOn: 1 }),
    'yyyy-MM-dd',
  );

  try {
    const { data: progressions, error } = await supabase
      .from('contrats_progressions')
      .select(
        'contrat_id, progression_percentage, completed_sequences_count, total_spent_time_hours',
      );

    if (error) {
      logger.error('cron.progression-snapshot', 'fetch progressions failed', {
        error,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!progressions || progressions.length === 0) {
      return NextResponse.json({
        success: true,
        semaine_debut: semaineDebut,
        inserted: 0,
        skipped: 0,
        note: 'No progressions to snapshot',
      });
    }

    const payload = progressions.map((p) => ({
      contrat_id: p.contrat_id,
      semaine_debut: semaineDebut,
      progression_percentage: p.progression_percentage ?? 0,
      completed_sequences: p.completed_sequences_count ?? null,
      total_spent_time_hours: p.total_spent_time_hours ?? null,
    }));

    // Chunk upsert to stay under payload limits
    const CHUNK = 500;
    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < payload.length; i += CHUNK) {
      const slice = payload.slice(i, i + CHUNK);
      const { error: upsertError, count } = await supabase
        .from('progression_snapshots_weekly')
        .upsert(slice, {
          onConflict: 'contrat_id,semaine_debut',
          ignoreDuplicates: true,
          count: 'exact',
        });

      if (upsertError) {
        logger.error('cron.progression-snapshot', 'upsert chunk failed', {
          error: upsertError,
          index: i,
        });
        skipped += slice.length;
      } else {
        inserted += count ?? 0;
      }
    }

    return NextResponse.json({
      success: true,
      semaine_debut: semaineDebut,
      total: progressions.length,
      inserted,
      skipped,
    });
  } catch (err) {
    logger.error('cron.progression-snapshot', 'unexpected', { error: err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 },
    );
  }
}
