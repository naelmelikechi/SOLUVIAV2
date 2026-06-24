'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/queries/users';
import { logAudit } from '@/lib/utils/audit';
import { logger } from '@/lib/utils/logger';
import { isAdmin } from '@/lib/utils/roles';
import { computeLigneTotaux } from '@/lib/utils/devis-totals';
import { getDefaultSocieteEmettriceId } from '@/lib/queries/societes-emettrices';

type Result<T = object> =
  | ({ success: true } & T)
  | { success: false; error: string };

const LigneSchema = z.object({
  libelle: z.string().min(1),
  description: z.string().nullish(),
  quantite: z.number().positive(),
  prix_unitaire_ht: z.number().nonnegative(),
  taux_tva: z.number().nonnegative().default(20),
});

const CreateDevisSchema = z.object({
  client_id: z.string().uuid(),
  societe_emettrice_id: z.string().uuid().optional(),
  objet: z.string().min(1),
  date_validite: z.string().optional(), // ISO date
  conditions_reglement: z.string().optional(),
  notes_internes: z.string().optional(),
  lignes: z.array(LigneSchema).min(1),
});

export type CreateDevisInput = z.input<typeof CreateDevisSchema>;

export async function createDevis(
  input: CreateDevisInput,
): Promise<Result<{ id: string }>> {
  const user = await getUser();
  if (!isAdmin(user?.role))
    return { success: false, error: 'Accès refusé (admin requis)' };

  const parsed = CreateDevisSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };

  const supabase = await createClient();
  const societeId =
    parsed.data.societe_emettrice_id ?? (await getDefaultSocieteEmettriceId());

  // Calcul date_validite default = today + validite_devis_jours de la societe
  let dateValidite = parsed.data.date_validite;
  if (!dateValidite) {
    const { data: soc } = await supabase
      .from('societes_emettrices')
      .select('validite_devis_jours')
      .eq('id', societeId)
      .single();
    const jours = soc?.validite_devis_jours ?? 90;
    const d = new Date();
    d.setDate(d.getDate() + jours);
    dateValidite = d.toISOString().slice(0, 10);
  }

  // Insert devis (brouillon)
  const { data: devis, error: devisErr } = await supabase
    .from('devis')
    .insert({
      societe_emettrice_id: societeId,
      client_id: parsed.data.client_id,
      objet: parsed.data.objet,
      date_validite: dateValidite,
      conditions_reglement: parsed.data.conditions_reglement,
      notes_internes: parsed.data.notes_internes,
      created_by: user!.id,
    })
    .select('id')
    .single();
  if (devisErr || !devis) {
    logger.error('actions.devis', 'create devis failed', { error: devisErr });
    return {
      success: false,
      error: devisErr?.message ?? 'Erreur creation devis',
    };
  }

  // Insert lignes (totaux calcules cote app + trigger recompute confirme)
  const lignesPayload = parsed.data.lignes.map((l, i) => ({
    devis_id: devis.id,
    ordre: i + 1,
    libelle: l.libelle,
    description: l.description ?? null,
    quantite: l.quantite,
    prix_unitaire_ht: l.prix_unitaire_ht,
    taux_tva: l.taux_tva,
    ...computeLigneTotaux(l),
  }));
  const { error: lignesErr } = await supabase
    .from('devis_lignes')
    .insert(lignesPayload);
  if (lignesErr) {
    logger.error('actions.devis', 'insert lignes failed', { error: lignesErr });
    return { success: false, error: lignesErr.message };
  }

  logAudit('devis_created', 'devis', devis.id, {
    client_id: parsed.data.client_id,
    objet: parsed.data.objet,
  });
  revalidatePath('/devis');
  return { success: true, id: devis.id };
}

export async function addLigne(
  devisId: string,
  ligne: z.input<typeof LigneSchema>,
): Promise<Result<{ id: string }>> {
  const user = await getUser();
  if (!isAdmin(user?.role)) return { success: false, error: 'Accès refusé' };
  const parsed = LigneSchema.safeParse(ligne);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Ligne invalide',
    };
  const supabase = await createClient();
  // Determine prochain ordre
  const { data: maxOrdre } = await supabase
    .from('devis_lignes')
    .select('ordre')
    .eq('devis_id', devisId)
    .order('ordre', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrdre = (maxOrdre?.ordre ?? 0) + 1;
  const totaux = computeLigneTotaux(parsed.data);
  const { data, error } = await supabase
    .from('devis_lignes')
    .insert({
      devis_id: devisId,
      ordre: nextOrdre,
      libelle: parsed.data.libelle,
      description: parsed.data.description ?? null,
      quantite: parsed.data.quantite,
      prix_unitaire_ht: parsed.data.prix_unitaire_ht,
      taux_tva: parsed.data.taux_tva,
      ...totaux,
    })
    .select('id')
    .single();
  if (error || !data)
    return { success: false, error: error?.message ?? 'Erreur' };
  revalidatePath(`/devis`);
  return { success: true, id: data.id };
}

export async function updateLigne(
  ligneId: string,
  input: z.input<typeof LigneSchema>,
): Promise<Result> {
  const user = await getUser();
  if (!isAdmin(user?.role)) return { success: false, error: 'Accès refusé' };
  const parsed = LigneSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Ligne invalide',
    };
  const supabase = await createClient();
  const totaux = computeLigneTotaux(parsed.data);
  const { error } = await supabase
    .from('devis_lignes')
    .update({
      libelle: parsed.data.libelle,
      description: parsed.data.description ?? null,
      quantite: parsed.data.quantite,
      prix_unitaire_ht: parsed.data.prix_unitaire_ht,
      taux_tva: parsed.data.taux_tva,
      ...totaux,
    })
    .eq('id', ligneId);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/devis`);
  return { success: true };
}

export async function deleteLigne(ligneId: string): Promise<Result> {
  const user = await getUser();
  if (!isAdmin(user?.role)) return { success: false, error: 'Accès refusé' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('devis_lignes')
    .delete()
    .eq('id', ligneId);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/devis`);
  return { success: true };
}

export async function sendDevis(
  devisId: string,
  _opts?: { to?: string[]; cc?: string[] },
): Promise<Result<{ ref: string }>> {
  const user = await getUser();
  if (!isAdmin(user?.role)) return { success: false, error: 'Accès refusé' };
  const supabase = await createClient();
  // 1. Bascule statut a envoye (triggers : alloue ref + token)
  const { data: updated, error: updErr } = await supabase
    .from('devis')
    .update({ statut: 'envoye' })
    .eq('id', devisId)
    .eq('statut', 'brouillon')
    .select('id, ref, acceptation_token, client_id, societe_emettrice_id')
    .single();
  if (updErr || !updated)
    return { success: false, error: updErr?.message ?? 'Devis non envoyable' };

  // 2. Marquer pdf_locked = true
  await supabase.from('devis').update({ pdf_locked: true }).eq('id', devisId);

  // 3. Email envoi : delegue a lib/email/devis-templates::sendDevisEmail
  try {
    const { sendDevisEmail } = await import('@/lib/email/devis-templates');
    await sendDevisEmail({
      devisId: updated.id,
      to: _opts?.to,
      cc: _opts?.cc,
    });
  } catch (e) {
    logger.warn('actions.devis', 'sendDevisEmail failed (non-bloquant)', {
      error: e,
    });
  }

  logAudit('devis_sent', 'devis', devisId, { ref: updated.ref });
  revalidatePath('/devis');
  revalidatePath(`/devis/${updated.ref}`);
  return { success: true, ref: updated.ref! };
}

export async function cancelDevis(devisId: string): Promise<Result> {
  const user = await getUser();
  if (!isAdmin(user?.role)) return { success: false, error: 'Accès refusé' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('devis')
    .update({ statut: 'annule' })
    .eq('id', devisId)
    .eq('statut', 'brouillon');
  if (error) return { success: false, error: error.message };
  logAudit('devis_cancelled', 'devis', devisId);
  revalidatePath('/devis');
  return { success: true };
}

export async function reviseDevis(
  devisId: string,
): Promise<Result<{ newDevisId: string }>> {
  const user = await getUser();
  if (!isAdmin(user?.role)) return { success: false, error: 'Accès refusé' };

  const supabase = await createClient();
  const { data: oldDevis, error: oldErr } = await supabase
    .from('devis')
    .select('*, lignes:devis_lignes(*)')
    .eq('id', devisId)
    .single();
  if (oldErr || !oldDevis)
    return { success: false, error: 'Devis introuvable' };
  if (oldDevis.statut !== 'envoye')
    return { success: false, error: 'Seul un devis envoyé peut être révisé' };

  // 1. Cree un nouveau devis brouillon, lie au precedent (v+1)
  const { data: newDevis, error: newErr } = await supabase
    .from('devis')
    .insert({
      societe_emettrice_id: oldDevis.societe_emettrice_id,
      client_id: oldDevis.client_id,
      objet: oldDevis.objet,
      date_validite: oldDevis.date_validite,
      conditions_reglement: oldDevis.conditions_reglement,
      notes_internes: oldDevis.notes_internes,
      devis_parent_id: oldDevis.id,
      version: (oldDevis.version ?? 1) + 1,
      created_by: user!.id,
    })
    .select('id')
    .single();
  if (newErr || !newDevis)
    return { success: false, error: newErr?.message ?? 'Erreur creation v+1' };

  // 2. Copie les lignes
  type OldLigne = {
    ordre: number;
    libelle: string;
    description: string | null;
    quantite: number;
    prix_unitaire_ht: number;
    taux_tva: number;
    total_ht: number;
    total_tva: number;
    total_ttc: number;
  };
  const lignesPayload = (oldDevis.lignes as OldLigne[]).map((l) => ({
    devis_id: newDevis.id,
    ordre: l.ordre,
    libelle: l.libelle,
    description: l.description,
    quantite: l.quantite,
    prix_unitaire_ht: l.prix_unitaire_ht,
    taux_tva: l.taux_tva,
    total_ht: l.total_ht,
    total_tva: l.total_tva,
    total_ttc: l.total_ttc,
  }));
  if (lignesPayload.length > 0) {
    await supabase.from('devis_lignes').insert(lignesPayload);
  }

  // 3. Bascule l'ancien en remplace
  await supabase
    .from('devis')
    .update({ statut: 'remplace' })
    .eq('id', oldDevis.id);

  logAudit('devis_revised', 'devis', newDevis.id, {
    from: oldDevis.id,
    from_ref: oldDevis.ref,
  });
  revalidatePath('/devis');
  return { success: true, newDevisId: newDevis.id };
}
