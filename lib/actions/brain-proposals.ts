'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { checkAuth } from '@/lib/auth/guards';
import { isAdmin } from '@/lib/utils/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  applyProposal,
  gapToBrainNote,
  type BrainProposal,
} from '@/lib/brain/proposal';
import type { BrainNote } from '@/lib/brain/types';
import type { Json } from '@/types/database';
import { logger } from '@/lib/utils/logger';

type Result = { success: boolean; error?: string };

type AdminDb = ReturnType<typeof createAdminClient>;

const ApproveSchema = z.object({
  id: z.string().uuid(),
  editedBody: z.string().max(50000).optional(),
});
const RejectSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
const GapSchema = z.object({
  id: z.string().uuid(),
  answer: z.string().min(1).max(20000),
});
const StaleSchema = z.object({
  id: z.string().uuid(),
  choix: z.enum(['garder', 'archiver', 'regenerer']),
});

/** Admin + client service-role (la RLS de brain_notes n'ouvre que le select). */
async function adminGate() {
  const auth = await checkAuth();
  if (!auth.ok) return { ok: false as const, error: auth.error };
  if (!isAdmin(auth.role))
    return { ok: false as const, error: 'Réservé aux admins' };
  return { ok: true as const, userId: auth.user.id, db: createAdminClient() };
}

/** Écrit la note dans brain_notes (upsert par path). */
async function upsertNote(
  db: AdminDb,
  note: BrainNote,
): Promise<string | null> {
  const { error } = await db.from('brain_notes').upsert(
    {
      path: note.path,
      type: note.type,
      title: note.title,
      aliases: note.aliases,
      tags: note.tags,
      links: note.links,
      body: note.body,
      frontmatter: note.frontmatter as unknown as Json,
      source_ref: note.source_ref,
      source_hash: note.source_hash,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'path' },
  );
  return error ? error.message : null;
}

/**
 * Transition conditionnelle : `where status = 'en_attente'` garantit qu'un
 * double-clic (ou deux onglets) ne produit pas deux écritures. 0 ligne
 * affectée = déjà traité.
 */
async function decide(
  db: AdminDb,
  id: string,
  status: string,
  userId: string,
  reason?: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('brain_proposals')
    .update({
      status,
      reason: reason ?? null,
      decided_by: userId,
      decided_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'en_attente')
    .select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

async function loadPending(
  db: AdminDb,
  id: string,
): Promise<BrainProposal & { id: string }> {
  const { data, error } = await db
    .from('brain_proposals')
    .select('id, kind, status, target_path, payload, source_ref, source_hash')
    .eq('id', id)
    .single();
  if (error || !data) throw new Error('Proposition introuvable');
  return data as unknown as BrainProposal & { id: string };
}

/** Approuve une proposition `conversation` ou `entite` → écrit la note. */
export async function approveProposalAction(
  input: z.infer<typeof ApproveSchema>,
): Promise<Result> {
  const parsed = ApproveSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Données invalides' };
  const gate = await adminGate();
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const proposal = await loadPending(gate.db, parsed.data.id);
    const note = applyProposal(proposal, parsed.data.editedBody);
    // On écrit AVANT de marquer approuvée : si l'upsert échoue, la proposition
    // reste `en_attente` et l'admin peut réessayer. Rien n'est perdu.
    const err = await upsertNote(gate.db, note);
    if (err) return { success: false, error: err };
    const moved = await decide(
      gate.db,
      parsed.data.id,
      'approuvee',
      gate.userId,
    );
    if (!moved) return { success: false, error: 'Proposition déjà traitée' };
  } catch (e) {
    logger.error('actions.brain-proposals', 'approve failed', { error: e });
    return { success: false, error: (e as Error).message };
  }

  revalidatePath('/admin/cerveau', 'layout');
  return { success: true };
}

/** Rejette : rien n'entre dans le cerveau, et le rejet est durable (source_hash). */
export async function rejectProposalAction(
  input: z.infer<typeof RejectSchema>,
): Promise<Result> {
  const parsed = RejectSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Données invalides' };
  const gate = await adminGate();
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const moved = await decide(
      gate.db,
      parsed.data.id,
      'rejetee',
      gate.userId,
      parsed.data.reason,
    );
    if (!moved) return { success: false, error: 'Proposition déjà traitée' };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
  revalidatePath('/admin/cerveau', 'layout');
  return { success: true };
}

/** Lacune 👎 : la réponse saisie par l'admin devient une note `conversation`. */
export async function resolveGapAction(
  input: z.infer<typeof GapSchema>,
): Promise<Result> {
  const parsed = GapSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Réponse manquante' };
  const gate = await adminGate();
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const proposal = await loadPending(gate.db, parsed.data.id);
    const p = proposal.payload as {
      question?: string;
      answer_ko?: string;
      derived_from?: string[];
      source_hashes?: Record<string, string>;
    };
    const note = gapToBrainNote(
      {
        id: proposal.source_ref,
        question: p.question ?? '',
        answer_ko: p.answer_ko ?? '',
      },
      parsed.data.answer,
      p.derived_from ?? [],
      p.source_hashes ?? {},
    );
    const err = await upsertNote(gate.db, note);
    if (err) return { success: false, error: err };
    const moved = await decide(
      gate.db,
      parsed.data.id,
      'approuvee',
      gate.userId,
    );
    if (!moved) return { success: false, error: 'Proposition déjà traitée' };
  } catch (e) {
    logger.error('actions.brain-proposals', 'resolveGap failed', { error: e });
    return { success: false, error: (e as Error).message };
  }
  revalidatePath('/admin/cerveau', 'layout');
  return { success: true };
}

/** Obsolescence : garder (dé-staler) / archiver (supprimer) / régénérer (drapeau). */
export async function arbitrateStaleAction(
  input: z.infer<typeof StaleSchema>,
): Promise<Result> {
  const parsed = StaleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Données invalides' };
  const gate = await adminGate();
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const proposal = await loadPending(gate.db, parsed.data.id);
    const path = proposal.target_path;
    if (!path) return { success: false, error: 'Proposition sans note cible' };

    if (parsed.data.choix === 'garder') {
      const { data: rows, error } = await gate.db
        .from('brain_notes')
        .select('body, frontmatter')
        .eq('path', path)
        .single();
      if (error || !rows) return { success: false, error: 'Note introuvable' };
      const body = String(rows.body).replace(/^> ⚠️[^\n]*\n\n/, '');
      const { error: upErr } = await gate.db
        .from('brain_notes')
        .update({
          body,
          frontmatter: {
            ...(rows.frontmatter as Record<string, unknown>),
            stale: false,
          } as unknown as Json,
          updated_at: new Date().toISOString(),
        })
        .eq('path', path);
      if (upErr) return { success: false, error: upErr.message };
    } else if (parsed.data.choix === 'archiver') {
      const { error } = await gate.db
        .from('brain_notes')
        .delete()
        .eq('path', path);
      if (error) return { success: false, error: error.message };
    } else {
      // Régénérer : l'app ne peut pas appeler Claude (abonnement Max). On pose
      // le drapeau ; le prochain `npm run brain:ingest` réanalyse et repropose.
      const { error } = await gate.db
        .from('brain_proposals')
        .update({
          status: 'a_regenerer',
          decided_by: gate.userId,
          decided_at: new Date().toISOString(),
        })
        .eq('id', parsed.data.id)
        .eq('status', 'en_attente');
      if (error) return { success: false, error: error.message };
      revalidatePath('/admin/cerveau', 'layout');
      return { success: true };
    }

    const moved = await decide(
      gate.db,
      parsed.data.id,
      'approuvee',
      gate.userId,
      parsed.data.choix,
    );
    if (!moved) return { success: false, error: 'Proposition déjà traitée' };
  } catch (e) {
    logger.error('actions.brain-proposals', 'arbitrateStale failed', {
      error: e,
    });
    return { success: false, error: (e as Error).message };
  }
  revalidatePath('/admin/cerveau', 'layout');
  return { success: true };
}
