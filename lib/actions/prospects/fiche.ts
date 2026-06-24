'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { canAccessPipeline } from '@/lib/utils/roles';
import { logAudit } from '@/lib/utils/audit';
import {
  lookupEntrepriseBySiren,
  normalizeSiren,
  type EntrepriseInsee,
} from '@/lib/insee/recherche-entreprises';
import {
  getAuth,
  CANAL_VALUES,
  type CanalOrigine,
  type RoleDecisionContact,
} from './shared';

// ---------------------------------------------------------------------------
// Onglet négociation
// ---------------------------------------------------------------------------

const NegotiationSchema = z.object({
  id: z.string().uuid(),
  tauxNpec: z.number().min(0).max(100).nullable().optional(),
  dureeContratAns: z.number().int().min(0).max(10).nullable().optional(),
  moisDemarrage: z.number().int().min(0).max(3).nullable().optional(),
  volumeAn1: z.number().int().min(0).nullable().optional(),
  volumeAn2: z.number().int().min(0).nullable().optional(),
  volumeAn3: z.number().int().min(0).nullable().optional(),
  volumeGarantiSeuil: z.number().int().min(0).nullable().optional(),
  leviers: z.array(z.string().max(100)).max(50).nullable().optional(),
  perimetreMissions: z.string().max(4000).nullable().optional(),
});

export async function updateProspectNegotiation(input: {
  id: string;
  tauxNpec?: number | null;
  dureeContratAns?: number | null;
  moisDemarrage?: number | null;
  volumeAn1?: number | null;
  volumeAn2?: number | null;
  volumeAn3?: number | null;
  volumeGarantiSeuil?: number | null;
  leviers?: string[] | null;
  perimetreMissions?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const parsed = NegotiationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const { supabase, user, role, pipelineAccess } = await getAuth();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!canAccessPipeline(role, pipelineAccess)) {
    return { success: false, error: 'Accès refusé' };
  }

  const d = parsed.data;
  const { error } = await supabase
    .from('prospects')
    .update({
      taux_npec: d.tauxNpec ?? null,
      duree_contrat_ans: d.dureeContratAns ?? null,
      mois_demarrage: d.moisDemarrage ?? null,
      volume_an1: d.volumeAn1 ?? null,
      volume_an2: d.volumeAn2 ?? null,
      volume_an3: d.volumeAn3 ?? null,
      volume_garanti_seuil: d.volumeGarantiSeuil ?? null,
      leviers: d.leviers ?? null,
      perimetre_missions: d.perimetreMissions ?? null,
      derniere_action_at: new Date().toISOString(),
    })
    .eq('id', d.id);

  if (error) return { success: false, error: error.message };

  logAudit(
    'prospect_negotiation_updated',
    'prospect',
    d.id,
    { taux_npec: d.tauxNpec ?? null },
    user.id,
  );
  revalidatePath(`/commercial/prospects/${d.id}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Identité / vigilance / notes inter-équipe
// ---------------------------------------------------------------------------

const IdentiteSchema = z.object({
  id: z.string().uuid(),
  region: z.string().trim().max(120).nullable().optional(),
  adresse: z.string().trim().max(300).nullable().optional(),
  siteWeb: z.string().trim().max(300).nullable().optional(),
  dirigeantNom: z.string().trim().max(160).nullable().optional(),
  dirigeantEmail: z.string().trim().max(200).nullable().optional(),
  dirigeantTelephone: z.string().trim().max(40).nullable().optional(),
  dirigeantPoste: z.string().trim().max(160).nullable().optional(),
  canalOrigine: z.enum(CANAL_VALUES).nullable().optional(),
  volumeApprenants: z.number().int().min(0).nullable().optional(),
  pointsVigilance: z.string().max(8000).nullable().optional(),
  notesInterEquipe: z.string().max(8000).nullable().optional(),
});

export async function updateProspectIdentite(input: {
  id: string;
  region?: string | null;
  adresse?: string | null;
  siteWeb?: string | null;
  dirigeantNom?: string | null;
  dirigeantEmail?: string | null;
  dirigeantTelephone?: string | null;
  dirigeantPoste?: string | null;
  canalOrigine?: CanalOrigine | null;
  volumeApprenants?: number | null;
  pointsVigilance?: string | null;
  notesInterEquipe?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const parsed = IdentiteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const { supabase, user, role, pipelineAccess } = await getAuth();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!canAccessPipeline(role, pipelineAccess)) {
    return { success: false, error: 'Accès refusé' };
  }

  const d = parsed.data;
  const { error } = await supabase
    .from('prospects')
    .update({
      region: d.region ?? null,
      adresse: d.adresse ?? null,
      site_web: d.siteWeb ?? null,
      dirigeant_nom: d.dirigeantNom ?? null,
      dirigeant_email: d.dirigeantEmail ?? null,
      dirigeant_telephone: d.dirigeantTelephone ?? null,
      dirigeant_poste: d.dirigeantPoste ?? null,
      canal_origine: d.canalOrigine ?? null,
      volume_apprenants: d.volumeApprenants ?? null,
      points_vigilance: d.pointsVigilance ?? null,
      notes_inter_equipe: d.notesInterEquipe ?? null,
      derniere_action_at: new Date().toISOString(),
    })
    .eq('id', d.id);

  if (error) return { success: false, error: error.message };

  logAudit('prospect_identite_updated', 'prospect', d.id, undefined, user.id);
  revalidatePath(`/commercial/prospects/${d.id}`);
  return { success: true };
}

export async function verifyProspectSiren(
  id: string,
  siren: string,
): Promise<{ success: boolean; error?: string; entreprise?: EntrepriseInsee }> {
  const cleanSiren = normalizeSiren(siren);
  if (!cleanSiren) {
    return { success: false, error: 'SIREN invalide (9 chiffres attendus)' };
  }

  const { supabase, user, role, pipelineAccess } = await getAuth();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!canAccessPipeline(role, pipelineAccess)) {
    return { success: false, error: 'Accès refusé' };
  }

  const e = await lookupEntrepriseBySiren(cleanSiren);
  if (!e) {
    await supabase
      .from('prospects')
      .update({ siren: cleanSiren, insee_verifie: false })
      .eq('id', id);
    return { success: false, error: 'SIREN introuvable auprès de l’INSEE' };
  }

  const { error } = await supabase
    .from('prospects')
    .update({
      siren: e.siren,
      siret: e.siret,
      adresse: e.adresse,
      forme_juridique: e.formeJuridique,
      code_naf: e.codeNaf,
      effectif_tranche: e.effectifTranche,
      insee_verifie: true,
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  logAudit(
    'prospect_siren_verified',
    'prospect',
    id,
    { siren: e.siren },
    user.id,
  );
  revalidatePath(`/commercial/prospects/${id}`);
  return { success: true, entreprise: e };
}

// ---------------------------------------------------------------------------
// Interlocuteurs (prospect_contacts) + contact principal
// ---------------------------------------------------------------------------

const ContactSchema = z.object({
  nom: z.string().trim().min(1, 'Nom requis').max(160),
  poste: z.string().trim().max(160).nullable().optional(),
  email: z.string().trim().max(200).nullable().optional(),
  telephone: z.string().trim().max(40).nullable().optional(),
  roleDecision: z
    .enum(['signataire', 'sponsor', 'operationnel', 'soutien'])
    .nullable()
    .optional(),
  sensibilites: z.string().max(2000).nullable().optional(),
  linkedin: z.string().trim().max(300).nullable().optional(),
});

export async function addProspectContact(
  prospectId: string,
  input: {
    nom: string;
    poste?: string | null;
    email?: string | null;
    telephone?: string | null;
    roleDecision?: RoleDecisionContact | null;
    sensibilites?: string | null;
    linkedin?: string | null;
  },
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!z.string().uuid().safeParse(prospectId).success) {
    return { success: false, error: 'Prospect invalide' };
  }
  const parsed = ContactSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const { supabase, user, role, pipelineAccess } = await getAuth();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!canAccessPipeline(role, pipelineAccess)) {
    return { success: false, error: 'Accès refusé' };
  }

  const c = parsed.data;
  const { data: created, error } = await supabase
    .from('prospect_contacts')
    .insert({
      prospect_id: prospectId,
      nom: c.nom,
      poste: c.poste ?? null,
      email: c.email ?? null,
      telephone: c.telephone ?? null,
      role_decision: c.roleDecision ?? null,
      sensibilites: c.sensibilites ?? null,
      linkedin: c.linkedin ?? null,
    })
    .select('id')
    .single();

  if (error || !created) {
    return { success: false, error: error?.message ?? 'Création impossible' };
  }

  logAudit(
    'prospect_contact_added',
    'prospect',
    prospectId,
    undefined,
    user.id,
  );
  revalidatePath(`/commercial/prospects/${prospectId}`);
  return { success: true, id: created.id };
}

export async function updateProspectContact(
  id: string,
  input: {
    nom: string;
    poste?: string | null;
    email?: string | null;
    telephone?: string | null;
    roleDecision?: RoleDecisionContact | null;
    sensibilites?: string | null;
    linkedin?: string | null;
  },
): Promise<{ success: boolean; error?: string }> {
  if (!z.string().uuid().safeParse(id).success) {
    return { success: false, error: 'Contact invalide' };
  }
  const parsed = ContactSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const { supabase, user, role, pipelineAccess } = await getAuth();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!canAccessPipeline(role, pipelineAccess)) {
    return { success: false, error: 'Accès refusé' };
  }

  const c = parsed.data;
  const { error } = await supabase
    .from('prospect_contacts')
    .update({
      nom: c.nom,
      poste: c.poste ?? null,
      email: c.email ?? null,
      telephone: c.telephone ?? null,
      role_decision: c.roleDecision ?? null,
      sensibilites: c.sensibilites ?? null,
      linkedin: c.linkedin ?? null,
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  logAudit(
    'prospect_contact_updated',
    'prospect_contact',
    id,
    undefined,
    user.id,
  );
  return { success: true };
}

export async function deleteProspectContact(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  if (!z.string().uuid().safeParse(id).success) {
    return { success: false, error: 'Contact invalide' };
  }

  const { supabase, user, role, pipelineAccess } = await getAuth();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!canAccessPipeline(role, pipelineAccess)) {
    return { success: false, error: 'Accès refusé' };
  }

  const { error } = await supabase
    .from('prospect_contacts')
    .delete()
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  logAudit(
    'prospect_contact_deleted',
    'prospect_contact',
    id,
    undefined,
    user.id,
  );
  return { success: true };
}

export async function setProspectContactPrincipal(
  prospectId: string,
  contactId: string | null,
): Promise<{ success: boolean; error?: string }> {
  if (!z.string().uuid().safeParse(prospectId).success) {
    return { success: false, error: 'Prospect invalide' };
  }
  if (contactId !== null && !z.string().uuid().safeParse(contactId).success) {
    return { success: false, error: 'Contact invalide' };
  }

  const { supabase, user, role, pipelineAccess } = await getAuth();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!canAccessPipeline(role, pipelineAccess)) {
    return { success: false, error: 'Accès refusé' };
  }

  const { error } = await supabase
    .from('prospects')
    .update({ contact_principal_id: contactId })
    .eq('id', prospectId);

  if (error) return { success: false, error: error.message };

  logAudit(
    'prospect_contact_principal_set',
    'prospect',
    prospectId,
    { contactId },
    user.id,
  );
  revalidatePath(`/commercial/prospects/${prospectId}`);
  revalidatePath('/commercial/prospects');
  return { success: true };
}
