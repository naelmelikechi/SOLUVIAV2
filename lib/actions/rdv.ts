'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/utils/roles';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import type { StatutRdv } from '@/lib/utils/constants';

// ---------------------------------------------------------------------------
// RDV formateurs (CDP scope)
// ---------------------------------------------------------------------------

export async function createRdvFormateur(
  projetId: string,
  data: {
    formateurNom?: string;
    formateurId?: string | null;
    datePrevue: string;
    objet?: string;
    notes?: string;
  },
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!data.datePrevue) {
    return { success: false, error: 'Date prévue requise' };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifié' };

  const { data: rdv, error } = await supabase
    .from('rdv_formateurs')
    .insert({
      projet_id: projetId,
      cdp_id: user.id,
      formateur_id: data.formateurId ?? null,
      formateur_nom: data.formateurNom?.trim() || null,
      date_prevue: data.datePrevue,
      objet: data.objet?.trim() || null,
      notes: data.notes?.trim() || null,
    })
    .select('id')
    .single();

  if (error || !rdv) {
    logger.error('actions.rdv', 'createRdvFormateur failed', { error });
    return { success: false, error: error?.message ?? 'Erreur' };
  }

  logAudit('rdv_formateur_created', 'rdv_formateur', rdv.id);
  revalidatePath(`/projets/[ref]`, 'page');
  return { success: true, id: rdv.id };
}

export async function updateRdvFormateurStatut(
  id: string,
  statut: StatutRdv,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifié' };

  const update: { statut: StatutRdv; date_realisee?: string | null } = {
    statut,
  };
  if (statut === 'realise') {
    update.date_realisee = new Date().toISOString().slice(0, 10);
  } else if (statut === 'prevu') {
    update.date_realisee = null;
  }

  const { error } = await supabase
    .from('rdv_formateurs')
    .update(update)
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  logAudit('rdv_formateur_statut_updated', 'rdv_formateur', id, { statut });
  revalidatePath(`/projets/[ref]`, 'page');
  return { success: true };
}

export async function deleteRdvFormateur(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifié' };

  const { error } = await supabase.from('rdv_formateurs').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  logAudit('rdv_formateur_deleted', 'rdv_formateur', id);
  revalidatePath(`/projets/[ref]`, 'page');
  return { success: true };
}

// ---------------------------------------------------------------------------
// RDV commerciaux (pipeline scope)
// ---------------------------------------------------------------------------

export async function createRdvCommercial(
  prospectId: string,
  data: { datePrevue: string; objet?: string; notes?: string },
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!data.datePrevue) {
    return { success: false, error: 'Date prévue requise' };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifié' };

  const { data: rdv, error } = await supabase
    .from('rdv_commerciaux')
    .insert({
      prospect_id: prospectId,
      commercial_id: user.id,
      date_prevue: data.datePrevue,
      objet: data.objet?.trim() || null,
      notes: data.notes?.trim() || null,
    })
    .select('id')
    .single();

  if (error || !rdv) {
    logger.error('actions.rdv', 'createRdvCommercial failed', { error });
    return { success: false, error: error?.message ?? 'Erreur' };
  }

  logAudit('rdv_commercial_created', 'rdv_commercial', rdv.id);
  revalidatePath('/commercial/pipeline');
  return { success: true, id: rdv.id };
}

export async function updateRdvCommercialStatut(
  id: string,
  statut: StatutRdv,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifié' };

  const update: { statut: StatutRdv; date_realisee?: string | null } = {
    statut,
  };
  if (statut === 'realise') {
    update.date_realisee = new Date().toISOString().slice(0, 10);
  } else if (statut === 'prevu') {
    update.date_realisee = null;
  }

  const { error } = await supabase
    .from('rdv_commerciaux')
    .update(update)
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  logAudit('rdv_commercial_statut_updated', 'rdv_commercial', id, { statut });
  revalidatePath('/commercial/pipeline');
  return { success: true };
}

export async function deleteRdvCommercial(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifié' };

  const { data: existing } = await supabase
    .from('rdv_commerciaux')
    .select('commercial_id')
    .eq('id', id)
    .single();

  const { data: caller } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (
    existing &&
    existing.commercial_id !== user.id &&
    !isAdmin(caller?.role)
  ) {
    return { success: false, error: 'Accès refusé' };
  }

  const { error } = await supabase
    .from('rdv_commerciaux')
    .delete()
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  logAudit('rdv_commercial_deleted', 'rdv_commercial', id);
  revalidatePath('/commercial/pipeline');
  return { success: true };
}
