import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { ProposalKind, ProposalStatus } from '@/lib/brain/proposal';

export interface ProposalRow {
  id: string;
  kind: ProposalKind;
  status: ProposalStatus;
  target_path: string | null;
  payload: Record<string, unknown>;
  source_ref: string;
  source_hash: string;
  reason: string | null;
  created_at: string;
}

/**
 * Ligne d'historique : déjà aplatie pour l'affichage. Le libellé et le nom du
 * décideur sont résolus ici plutôt que dans le composant — l'écran ne fait que
 * rendre un journal, il n'a pas à connaître la forme des `payload`.
 */
export interface DecidedProposalRow {
  id: string;
  kind: ProposalKind;
  label: string;
  status: ProposalStatus;
  reason: string | null;
  decided_at: string | null;
  /** `null` si l'arbitre a été supprimé : la FK est ON DELETE SET NULL. */
  decided_by_name: string | null;
}

/** Propositions à arbitrer, les plus anciennes d'abord (FIFO). */
export async function getPendingProposals(): Promise<ProposalRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('brain_proposals')
    .select(
      'id, kind, status, target_path, payload, source_ref, source_hash, reason, created_at',
    )
    .eq('status', 'en_attente')
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) {
    logger.error('queries.brain-proposals', 'getPendingProposals failed', {
      error,
    });
    throw error;
  }
  return (data ?? []) as ProposalRow[];
}

/** Libellé lisible d'une proposition : titre, sinon question, sinon le chemin. */
function labelOf(row: {
  payload: unknown;
  target_path: string | null;
  source_ref: string;
}): string {
  // `payload` est `jsonb not null`, mais `'null'::jsonb` reste possible : sans
  // le `?? {}` une seule ligne malformée ferait tomber tout l'historique.
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const { title, question } = payload;
  if (typeof title === 'string' && title) return title;
  if (typeof question === 'string' && question) return question;
  return row.target_path ?? row.source_ref;
}

/**
 * Propositions déjà arbitrées (approuvées ou rejetées), les plus récentes
 * d'abord. Plafonnée à 100 : c'est un journal qu'on consulte, pas une file à
 * traiter — et le rejet étant durable, c'est le seul endroit où l'admin peut
 * relire ce qu'il a écarté, et pourquoi.
 */
export async function getDecidedProposals(): Promise<DecidedProposalRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('brain_proposals')
    .select(
      'id, kind, status, target_path, payload, source_ref, reason, decided_at, decideur:users!brain_proposals_decided_by_fkey(nom, prenom)',
    )
    .neq('status', 'en_attente')
    // `decided_at` est renseigné par chaque transition, mais les lignes d'avant
    // ce champ (ou un arbitrage réécrit à la main) resteraient en tête sans
    // `nullsFirst: false`.
    .order('decided_at', { ascending: false, nullsFirst: false })
    .limit(100);
  if (error) {
    logger.error('queries.brain-proposals', 'getDecidedProposals failed', {
      error,
    });
    throw error;
  }
  return (data ?? []).map((row) => {
    const decideur = row.decideur as { nom: string; prenom: string } | null;
    return {
      id: row.id,
      kind: row.kind as ProposalKind,
      label: labelOf(row),
      status: row.status as ProposalStatus,
      reason: row.reason,
      decided_at: row.decided_at,
      decided_by_name: decideur
        ? `${decideur.prenom} ${decideur.nom}`.trim()
        : null,
    };
  });
}
