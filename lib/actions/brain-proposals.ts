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

// `sourceHash` = contrôle de concurrence optimiste. Le script réécrit une
// proposition existante en place (`do update set payload = …`) : la même ligne
// peut donc changer de contenu entre l'affichage et le clic. Obligatoire sur
// tout ce qui publie ; inutile pour un rejet, qui vaut pour toute version.
const ApproveSchema = z.object({
  id: z.string().uuid(),
  sourceHash: z.string().min(1).max(128),
  editedBody: z.string().max(50000).optional(),
});
const RejectSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
// Pas de `sourceHash` : rouvrir ne publie rien, et vaut donc pour n'importe
// quelle version du payload — comme le rejet qu'elle annule.
const ReopenSchema = z.object({
  id: z.string().uuid(),
});
const GapSchema = z.object({
  id: z.string().uuid(),
  sourceHash: z.string().min(1).max(128),
  answer: z.string().min(1).max(20000),
});
// Deux choix seulement. « Régénérer » a été retiré : pour une note de
// conversation la question et la réponse n'ont pas bougé — seule une source a
// changé — et l'app ne peut pas appeler Claude. Le chemin ne pouvait donc que
// dupliquer « Garder », après avoir consommé l'arbitrage.
const StaleSchema = z.object({
  id: z.string().uuid(),
  sourceHash: z.string().min(1).max(128),
  choix: z.enum(['garder', 'archiver']),
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
  // Une réponse rédigée par un admin (corrige: true) fait autorité sur une
  // paraphrase de l'assistant. Sans ce garde-fou, approuver la capitalisation
  // d'un 👍 sur la même question écraserait définitivement le texte humain.
  const { data: existante } = await db
    .from('brain_notes')
    .select('frontmatter')
    .eq('path', note.path)
    .maybeSingle();
  const dejaCorrigee =
    (existante?.frontmatter as Record<string, unknown> | null)?.['corrige'] ===
    true;
  const nouvelleCorrigee =
    (note.frontmatter as Record<string, unknown>)?.['corrige'] === true;
  if (dejaCorrigee && !nouvelleCorrigee) {
    return 'Cette question a déjà une réponse rédigée par un administrateur — rejette cette proposition, ou modifie la note existante.';
  }

  // Symétrique du garde ci-dessus, pour les entités. `verified: true` est posé à
  // la main sur les définitions officielles sourcées (23 des 31 entités en
  // production) ; une proposition ne le porte jamais (`entityToBrainNote` n'écrit
  // que `definition`). Sans ce garde, approuver une définition de Claude sur une
  // de ces entités remplacerait tout son corps — sources comprises.
  const dejaVerifiee =
    (existante?.frontmatter as Record<string, unknown> | null)?.['verified'] ===
    true;
  const nouvelleVerifiee =
    (note.frontmatter as Record<string, unknown>)?.['verified'] === true;
  if (dejaVerifiee && !nouvelleVerifiee) {
    return 'Cette entité a déjà une définition curée à la main (verified) — rejette cette proposition, ou modifie la note existante.';
  }

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

/**
 * Charge la proposition en attente, à condition que son `source_hash` soit
 * encore celui que l'admin avait sous les yeux. Sinon on refuse : publier un
 * payload réécrit depuis l'affichage reviendrait à mettre dans le cerveau un
 * texte que personne n'a relu.
 */
async function loadPending(
  db: AdminDb,
  id: string,
  sourceHash: string,
): Promise<BrainProposal & { id: string }> {
  const { data, error } = await db
    .from('brain_proposals')
    .select('id, kind, status, target_path, payload, source_ref, source_hash')
    .eq('id', id)
    .eq('status', 'en_attente')
    .eq('source_hash', sourceHash)
    .single();
  if (error || !data) {
    throw new Error(
      'Proposition déjà traitée, ou modifiée depuis son affichage — recharge la page',
    );
  }
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
    const proposal = await loadPending(
      gate.db,
      parsed.data.id,
      parsed.data.sourceHash,
    );
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

  revalidatePath('/admin/cerveau');
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
    logger.error('actions.brain-proposals', 'reject failed', { error: e });
    return { success: false, error: (e as Error).message };
  }
  revalidatePath('/admin/cerveau');
  return { success: true };
}

/**
 * Rouvre un rejet : la proposition repasse `en_attente` et réapparaît dans la
 * file. Le rejet est durable par conception (le script ne repropose pas une
 * ligne rejetée tant que son contenu ne change pas) : sans ce chemin, un rejet
 * fait par erreur serait définitif.
 *
 * Réservé aux rejets. Une proposition APPROUVÉE a déjà écrit sa note dans le
 * cerveau : la rouvrir laisserait la note en place tout en remettant son
 * arbitrage en file, un état sans signification claire — on corrige une note
 * publiée en la modifiant, pas en rejouant sa proposition.
 */
export async function reopenProposalAction(
  input: z.infer<typeof ReopenSchema>,
): Promise<Result> {
  const parsed = ReopenSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Données invalides' };
  const gate = await adminGate();
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    // Transition conditionnelle, comme `decide` en sens inverse : `where status
    // = 'rejetee'` borne la réouverture au seul état d'où elle a un sens, et
    // rend le double-clic (ou deux onglets) inoffensif — 0 ligne = déjà rouvert.
    const { data, error } = await gate.db
      .from('brain_proposals')
      .update({
        status: 'en_attente',
        // La proposition redevient vierge de décision : garder le motif du
        // rejet la ferait réapparaître dans la file avec une trace d'arbitrage
        // qui ne vaut plus, et fausserait l'historique au prochain passage.
        reason: null,
        decided_by: null,
        decided_at: null,
      })
      .eq('id', parsed.data.id)
      .eq('status', 'rejetee')
      .select('id');
    if (error) throw new Error(error.message);
    if (!(data ?? []).length)
      return {
        success: false,
        error: 'Seule une proposition rejetée peut être rouverte',
      };
  } catch (e) {
    logger.error('actions.brain-proposals', 'reopen failed', { error: e });
    return { success: false, error: (e as Error).message };
  }
  revalidatePath('/admin/cerveau');
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
    const proposal = await loadPending(
      gate.db,
      parsed.data.id,
      parsed.data.sourceHash,
    );
    // Symétrique du garde d'`arbitrateStaleAction`. Sans lui, cette action n'est
    // sûre qu'incidemment : les payloads des autres kinds n'ont pas de champ
    // `question`, donc `gapToBrainNote` lève avant d'écrire. Le jour où l'un
    // d'eux en gagnerait un, une réponse forgée entrerait dans le cerveau.
    if (proposal.kind !== 'lacune') {
      return {
        success: false,
        error: "Cette proposition n'est pas une lacune",
      };
    }
    const p = proposal.payload as {
      question?: string;
      answer_ko?: string;
    };

    // Les sources citées lors du 👎 sont résolues ICI (et non à l'ouverture de
    // la lacune) : elles alimentent frontmatter.source_hashes, sans lequel la
    // note ne serait jamais revisitée par l'anti-obsolescence.
    const { data: fb } = await gate.db
      .from('process_qa_feedback')
      .select('sources')
      .eq('id', proposal.source_ref)
      .maybeSingle();
    const ids = ((fb?.sources ?? []) as Array<{ source_fiche_id?: string }>)
      .map((s) => s.source_fiche_id)
      .filter((v): v is string => !!v);
    const derivedFrom: string[] = [];
    const sourceHashes: Record<string, string> = {};
    if (ids.length) {
      const { data: notes } = await gate.db
        .from('brain_notes')
        .select('path, source_ref, source_hash')
        .in('source_ref', ids);
      for (const n of notes ?? []) {
        const key = n.path.replace(/\.md$/, '');
        derivedFrom.push(key);
        if (n.source_hash) sourceHashes[key] = n.source_hash;
      }
    }
    derivedFrom.sort();

    const note = gapToBrainNote(
      {
        id: proposal.source_ref,
        question: p.question ?? '',
        answer_ko: p.answer_ko ?? '',
      },
      parsed.data.answer,
      derivedFrom,
      sourceHashes,
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
  revalidatePath('/admin/cerveau');
  return { success: true };
}

/**
 * Relit en base les empreintes COURANTES des notes sources d'une note, à partir
 * des clés déjà présentes dans son `frontmatter.source_hashes` (des paths sans
 * `.md`, à confronter à `brain_notes.path`).
 *
 * C'est le cœur du « garder telle quelle » : sans ce rafraîchissement, la note
 * repart avec les empreintes périmées dont `markStaleConversations` a justement
 * déduit l'obsolescence. Au run suivant elle serait re-marquée, et AUCUNE
 * proposition ne serait rouverte — le `source_hash` de l'arbitrage est calculé
 * sur ces mêmes empreintes inchangées, donc `shouldPropose` renvoie `skip`. La
 * note sortirait définitivement de la recherche.
 *
 * Source disparue de `brain_notes` : sa clé est RETIRÉE, pas conservée à `null`.
 * `markStaleConversations` compare `currentHash.get(p)` (soit `undefined`) à la
 * valeur stockée : un `null` conservé rouvrirait exactement la boucle qu'on
 * ferme ici. La provenance, elle, reste tracée par `frontmatter.derived_from` et
 * par la section « Sources » du corps, que ce chemin ne touche pas. Une source
 * qui existe mais dont le `source_hash` est `null` garde sa clé à `null` : la
 * comparaison est alors juste.
 */
async function empreintesCourantes(
  db: AdminDb,
  frontmatter: Record<string, unknown>,
): Promise<{ value: Record<string, string | null> } | { error: string }> {
  const cles = Object.keys(
    (frontmatter['source_hashes'] ?? {}) as Record<string, unknown>,
  );
  if (!cles.length) return { value: {} };
  const { data, error } = await db
    .from('brain_notes')
    .select('path, source_hash')
    .in(
      'path',
      cles.map((k) => `${k}.md`),
    );
  if (error) return { error: error.message };
  const courant = new Map(
    (data ?? []).map((n) => [n.path.replace(/\.md$/, ''), n.source_hash]),
  );
  const value: Record<string, string | null> = {};
  for (const k of cles) {
    if (courant.has(k)) value[k] = courant.get(k) ?? null;
  }
  return { value };
}

/** Obsolescence : garder (dé-staler + rafraîchir les empreintes) / archiver (drapeau). */
export async function arbitrateStaleAction(
  input: z.infer<typeof StaleSchema>,
): Promise<Result> {
  const parsed = StaleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Données invalides' };
  const gate = await adminGate();
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const proposal = await loadPending(
      gate.db,
      parsed.data.id,
      parsed.data.sourceHash,
    );
    // `noteToProposal` pose `target_path` sur TOUTES les propositions : sans ce
    // garde, l'identifiant d'une `conversation` passé ici avec `archiver`
    // suffirait à faire archiver une note approuvée. Une Server Action est un
    // point d'entrée HTTP — l'interface ne protège rien.
    if (proposal.kind !== 'obsolescence') {
      return {
        success: false,
        error: "Cette proposition n'est pas un arbitrage d'obsolescence",
      };
    }
    const path = proposal.target_path;
    if (!path) return { success: false, error: 'Proposition sans note cible' };

    if (parsed.data.choix === 'garder') {
      const { data: rows, error } = await gate.db
        .from('brain_notes')
        .select('body, frontmatter')
        .eq('path', path)
        .single();
      if (error || !rows) return { success: false, error: 'Note introuvable' };
      const fm = (rows.frontmatter ?? {}) as Record<string, unknown>;
      const hashes = await empreintesCourantes(gate.db, fm);
      if ('error' in hashes) return { success: false, error: hashes.error };
      const body = String(rows.body).replace(/^> ⚠️[^\n]*\n\n/, '');
      const { error: upErr } = await gate.db
        .from('brain_notes')
        .update({
          body,
          frontmatter: {
            ...fm,
            source_hashes: hashes.value,
            stale: false,
          } as unknown as Json,
          updated_at: new Date().toISOString(),
        })
        .eq('path', path);
      if (upErr) return { success: false, error: upErr.message };
    } else {
      // Archiver ≠ supprimer : la note sort de la recherche mais reste en base,
      // récupérable. C'est souvent la seule copie d'une réponse rédigée à la main.
      const { data: existante, error: lectErr } = await gate.db
        .from('brain_notes')
        .select('frontmatter')
        .eq('path', path)
        .maybeSingle();
      if (lectErr) return { success: false, error: lectErr.message };
      if (!existante) return { success: false, error: 'Note introuvable' };
      const { error } = await gate.db
        .from('brain_notes')
        .update({
          frontmatter: {
            ...(existante.frontmatter as Record<string, unknown>),
            archive: true,
          } as unknown as Json,
          updated_at: new Date().toISOString(),
        })
        .eq('path', path);
      if (error) return { success: false, error: error.message };
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
  revalidatePath('/admin/cerveau');
  return { success: true };
}
