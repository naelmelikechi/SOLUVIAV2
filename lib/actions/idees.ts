'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { canValidateIdeas, canShipIdeas, isAdmin } from '@/lib/utils/roles';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import type { CibleIdee } from '@/lib/utils/constants';

async function getCaller() {
  const auth = await requireUser();
  if (!auth.ok) {
    const supabase = await createClient();
    return {
      supabase,
      user: null,
      role: null,
      canValidate: false,
      canShip: false,
    };
  }
  const { supabase, user } = auth;
  const { data } = await supabase
    .from('users')
    .select('role, can_validate_ideas, can_ship_ideas')
    .eq('id', user.id)
    .single();
  return {
    supabase,
    user,
    role: data?.role ?? null,
    canValidate: data?.can_validate_ideas ?? false,
    canShip: data?.can_ship_ideas ?? false,
  };
}

type RequireStringResult =
  | { ok: false; error: string }
  | { ok: true; value: string };

function requireString(
  val: string | undefined | null,
  field: string,
): RequireStringResult {
  const trimmed = val?.trim() ?? '';
  if (!trimmed) return { ok: false, error: `${field} est requis` };
  return { ok: true, value: trimmed };
}

// ---------------------------------------------------------------------------
// Propose a new idea
// ---------------------------------------------------------------------------

export async function proposeIdea(data: {
  titre: string;
  description?: string;
  cible: CibleIdee;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const titreCheck = requireString(data.titre, 'Le titre');
  if (!titreCheck.ok) return { success: false, error: titreCheck.error };

  const { supabase, user } = await getCaller();
  if (!user) return { success: false, error: 'Non authentifié' };

  const { data: idee, error } = await supabase
    .from('idees')
    .insert({
      auteur_id: user.id,
      titre: titreCheck.value,
      description: data.description?.trim() || null,
      cible: data.cible,
      statut: 'proposee',
    })
    .select('id')
    .single();

  if (error || !idee) {
    logger.error('actions.idees', 'proposeIdea failed', { error });
    return { success: false, error: error?.message ?? 'Erreur' };
  }

  logAudit(
    'idea_proposed',
    'idee',
    idee.id,
    { titre: titreCheck.value },
    user.id,
  );
  revalidatePath('/idees');
  return { success: true, id: idee.id };
}

// ---------------------------------------------------------------------------
// Update a still-proposed idea (author only)
// ---------------------------------------------------------------------------

export async function updateProposedIdea(
  id: string,
  data: { titre: string; description?: string; cible: CibleIdee },
): Promise<{ success: boolean; error?: string }> {
  const titreCheck = requireString(data.titre, 'Le titre');
  if (!titreCheck.ok) return { success: false, error: titreCheck.error };

  const { supabase, user, role } = await getCaller();
  if (!user) return { success: false, error: 'Non authentifié' };

  const { data: existing, error: fetchError } = await supabase
    .from('idees')
    .select('auteur_id, statut')
    .eq('id', id)
    .single();
  if (fetchError || !existing) {
    return { success: false, error: 'Idée introuvable' };
  }
  if (existing.auteur_id !== user.id && !isAdmin(role)) {
    return { success: false, error: 'Vous ne pouvez pas modifier cette idée' };
  }
  if (existing.statut !== 'proposee') {
    return {
      success: false,
      error: 'Seules les idées en attente peuvent être modifiées',
    };
  }

  const { error } = await supabase
    .from('idees')
    .update({
      titre: titreCheck.value,
      description: data.description?.trim() || null,
      cible: data.cible,
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  logAudit('idea_updated', 'idee', id, undefined, user.id);
  revalidatePath('/idees');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Notify author
// ---------------------------------------------------------------------------

async function notifyAuthor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  authorId: string,
  type: 'idee_validee' | 'idee_rejetee' | 'idee_implementee',
  ideeTitre: string,
  ideeId: string,
  extra?: string,
) {
  const titleMap = {
    idee_validee: 'Ton idée a été validée',
    idee_rejetee: 'Ton idée a été rejetée',
    idee_implementee: 'Ton idée a été implémentée',
  } as const;
  const message =
    type === 'idee_rejetee'
      ? `"${ideeTitre}"${extra ? ` - motif : ${extra}` : ''}`
      : `"${ideeTitre}"`;
  await supabase.from('notifications').insert({
    user_id: authorId,
    type,
    titre: titleMap[type],
    message,
    lien: `/idees?id=${ideeId}`,
  });
}

// ---------------------------------------------------------------------------
// Validate an idea
// ---------------------------------------------------------------------------

export async function validateIdea(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const { supabase, user, role, canValidate } = await getCaller();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!canValidateIdeas(role, canValidate)) {
    return { success: false, error: 'Accès refusé' };
  }

  const { data: existing, error: fetchError } = await supabase
    .from('idees')
    .select('auteur_id, titre, statut')
    .eq('id', id)
    .single();
  if (fetchError || !existing) {
    return { success: false, error: 'Idée introuvable' };
  }
  if (existing.statut !== 'proposee') {
    return {
      success: false,
      error: 'Seules les idées proposées peuvent être validées',
    };
  }

  const { error } = await supabase
    .from('idees')
    .update({
      statut: 'validee',
      validee_par: user.id,
      validee_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  await notifyAuthor(
    supabase,
    existing.auteur_id,
    'idee_validee',
    existing.titre,
    id,
  );
  logAudit('idea_validated', 'idee', id, undefined, user.id);
  revalidatePath('/idees');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Reject an idea (with reason)
// ---------------------------------------------------------------------------

export async function rejectIdea(
  id: string,
  motif: string,
): Promise<{ success: boolean; error?: string }> {
  const motifCheck = requireString(motif, 'Le motif');
  if (!motifCheck.ok) return { success: false, error: motifCheck.error };

  const { supabase, user, role, canValidate } = await getCaller();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!canValidateIdeas(role, canValidate)) {
    return { success: false, error: 'Accès refusé' };
  }

  const { data: existing, error: fetchError } = await supabase
    .from('idees')
    .select('auteur_id, titre, statut')
    .eq('id', id)
    .single();
  if (fetchError || !existing) {
    return { success: false, error: 'Idée introuvable' };
  }
  if (existing.statut !== 'proposee') {
    return {
      success: false,
      error: 'Seules les idées proposées peuvent être rejetées',
    };
  }

  const { error } = await supabase
    .from('idees')
    .update({
      statut: 'rejetee',
      rejet_motif: motifCheck.value,
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  await notifyAuthor(
    supabase,
    existing.auteur_id,
    'idee_rejetee',
    existing.titre,
    id,
    motifCheck.value,
  );
  logAudit('idea_rejected', 'idee', id, { motif: motifCheck.value }, user.id);
  revalidatePath('/idees');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Mark an idea as implemented
// ---------------------------------------------------------------------------

export async function markIdeaImplemented(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const { supabase, user, role, canShip } = await getCaller();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!canShipIdeas(role, canShip)) {
    return { success: false, error: 'Accès refusé' };
  }

  const { data: existing, error: fetchError } = await supabase
    .from('idees')
    .select('auteur_id, titre, statut')
    .eq('id', id)
    .single();
  if (fetchError || !existing) {
    return { success: false, error: 'Idée introuvable' };
  }
  if (existing.statut !== 'validee') {
    return {
      success: false,
      error:
        'Seules les idées validées peuvent être marquées comme implémentées',
    };
  }

  const { error } = await supabase
    .from('idees')
    .update({
      statut: 'implementee',
      implementee_par: user.id,
      implementee_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  await notifyAuthor(
    supabase,
    existing.auteur_id,
    'idee_implementee',
    existing.titre,
    id,
  );
  logAudit('idea_shipped', 'idee', id, undefined, user.id);
  revalidatePath('/idees');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Re-open an idea (rejetee, validee or implementee) and put it back to proposee
// ---------------------------------------------------------------------------

export async function reopenIdea(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const { supabase, user, role, canValidate, canShip } = await getCaller();
  if (!user) return { success: false, error: 'Non authentifié' };

  const { data: existing, error: fetchError } = await supabase
    .from('idees')
    .select('auteur_id, titre, statut')
    .eq('id', id)
    .single();
  if (fetchError || !existing) {
    return { success: false, error: 'Idée introuvable' };
  }
  if (existing.statut === 'proposee') {
    return { success: false, error: "L'idée est déjà en attente" };
  }

  // Permissions : auteur peut rouvrir une rejetee. Pour rouvrir une validee
  // ou implementee, il faut canValidate (validee) ou canShip (implementee)
  // ou admin. Empeche un auteur de retirer le verdict d'un valideur.
  const isAuthor = existing.auteur_id === user.id;
  const isAdminRole = isAdmin(role);
  let allowed = isAdminRole;
  if (!allowed && existing.statut === 'rejetee') allowed = isAuthor;
  if (!allowed && existing.statut === 'validee') allowed = canValidate;
  if (!allowed && existing.statut === 'implementee') allowed = canShip;
  if (!allowed) return { success: false, error: 'Accès refusé' };

  const { error } = await supabase
    .from('idees')
    .update({
      statut: 'proposee',
      rejet_motif: null,
      validee_par: null,
      validee_at: null,
      implementee_par: null,
      implementee_at: null,
    })
    .eq('id', id);
  if (error) return { success: false, error: error.message };

  logAudit('idea_reopened', 'idee', id, { from: existing.statut }, user.id);
  revalidatePath('/idees');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Revert an implemented idea back to validated (oubli de sous-cas / regression)
// ---------------------------------------------------------------------------

export async function revertImplementedIdea(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const { supabase, user, role, canShip } = await getCaller();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!canShipIdeas(role, canShip)) {
    return { success: false, error: 'Accès refusé' };
  }

  const { data: existing, error: fetchError } = await supabase
    .from('idees')
    .select('statut')
    .eq('id', id)
    .single();
  if (fetchError || !existing) {
    return { success: false, error: 'Idée introuvable' };
  }
  if (existing.statut !== 'implementee') {
    return {
      success: false,
      error: 'Seules les idées implémentées peuvent être marquées non finies',
    };
  }

  const { error } = await supabase
    .from('idees')
    .update({ statut: 'validee', implementee_par: null, implementee_at: null })
    .eq('id', id);
  if (error) return { success: false, error: error.message };

  logAudit('idea_reverted_to_validated', 'idee', id, undefined, user.id);
  revalidatePath('/idees');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Re-open a rejected idea AND update its content
// ---------------------------------------------------------------------------

export async function reopenAndEditIdea(
  id: string,
  data: { titre: string; description?: string; cible: CibleIdee },
): Promise<{ success: boolean; error?: string }> {
  const titreCheck = requireString(data.titre, 'Le titre');
  if (!titreCheck.ok) return { success: false, error: titreCheck.error };

  const { supabase, user, role } = await getCaller();
  if (!user) return { success: false, error: 'Non authentifié' };

  const { data: existing, error: fetchError } = await supabase
    .from('idees')
    .select('auteur_id, statut')
    .eq('id', id)
    .single();
  if (fetchError || !existing) {
    return { success: false, error: 'Idée introuvable' };
  }
  if (existing.statut !== 'rejetee') {
    return {
      success: false,
      error: 'Seules les idées rejetées peuvent être rouvertes',
    };
  }
  const isAuthor = existing.auteur_id === user.id;
  const isAdminRole = isAdmin(role);
  if (!isAuthor && !isAdminRole) {
    return { success: false, error: 'Accès refusé' };
  }

  const { error } = await supabase
    .from('idees')
    .update({
      titre: titreCheck.value,
      description: data.description?.trim() || null,
      cible: data.cible,
      statut: 'proposee',
      rejet_motif: null,
    })
    .eq('id', id);
  if (error) return { success: false, error: error.message };

  logAudit('idea_reopened_with_edit', 'idee', id, undefined, user.id);
  revalidatePath('/idees');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Archive an idea (admin only)
// ---------------------------------------------------------------------------

export async function archiveIdea(
  id: string,
  archive: boolean,
): Promise<{ success: boolean; error?: string }> {
  const { supabase, user, role } = await getCaller();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!isAdmin(role)) {
    return { success: false, error: 'Accès refusé' };
  }

  const { error } = await supabase
    .from('idees')
    .update({ archive })
    .eq('id', id);
  if (error) return { success: false, error: error.message };

  logAudit(
    archive ? 'idea_archived' : 'idea_unarchived',
    'idee',
    id,
    undefined,
    user.id,
  );
  revalidatePath('/idees');
  return { success: true };
}
