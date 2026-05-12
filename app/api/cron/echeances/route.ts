import { logger } from '@/lib/utils/logger';
import { NextResponse } from 'next/server';

/**
 * Cron desactive : le mode auto/echeancier previsionnel a ete remplace
 * par la logique billable-events (lignes PEDAGOGIE des bordereaux OPCO).
 *
 * L'endpoint reste pour que la cron config Vercel n'erreur pas pendant
 * la fenetre de transition. A supprimer une fois la config Vercel
 * mise a jour (suivi separe).
 */
export async function GET() {
  logger.info('cron.echeances', 'disabled', {
    reason: 'mode auto/echeancier supprime par PR base-pedago 2026-05-12',
  });
  return NextResponse.json({ skipped: true });
}
