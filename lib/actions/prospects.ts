'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { requireAuth } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { canAccessPipeline, isAdmin } from '@/lib/utils/roles';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import type { Database } from '@/types/database';
import {
  lookupEntrepriseBySiren,
  normalizeSiren,
  type EntrepriseInsee,
} from '@/lib/insee/recherche-entreprises';
import type { ProspectDuplicate } from '@/lib/queries/prospects';

type StageProspect = Database['public']['Enums']['stage_prospect'];
type TypeProspect = Database['public']['Enums']['type_prospect'];
type CanalOrigine = Database['public']['Enums']['canal_origine'];
type RoleDecisionContact = Database['public']['Enums']['role_decision_contact'];

// ---------------------------------------------------------------------------
// Schemas Zod (validation cote serveur, defense en profondeur)
// ---------------------------------------------------------------------------
// Pourquoi : RLS bloque les acces non autorises mais ne contraint pas le
// type. Sans ces guards, un client peut poster ids=garbage, stage hors enum,
// commercialId hostile, ce qui crash la query Postgres ou corrompt la base.

const stageSchema = z.enum(
  ['a_qualifier', 'presente', 'cadre', 'audite', 'signe', 'perdu'],
  { message: 'Stage invalide' },
);

const LoadProspectDetailsSchema = z.object({
  id: z.string().uuid('Prospect ID doit être un UUID'),
});

const UpdateProspectStageSchema = z.object({
  id: z.string().uuid('Prospect ID doit être un UUID'),
  stage: stageSchema,
});

const UpdateProspectAssignmentSchema = z.object({
  id: z.string().uuid('Prospect ID doit être un UUID'),
  commercialId: z.string().uuid('commercialId doit être un UUID').nullable(),
});

const BulkUpdateProspectsSchema = z.object({
  ids: z
    .array(z.string().uuid('ID doit être un UUID'))
    .min(1, 'Aucun prospect sélectionné')
    .max(500, 'Maximum 500 prospects par operation'),
  patch: z
    .object({
      commercialId: z
        .string()
        .uuid('commercialId doit être un UUID')
        .nullable()
        .optional(),
      stage: stageSchema.optional(),
    })
    .refine(
      (p) => p.commercialId !== undefined || p.stage !== undefined,
      'Aucune modification fournie',
    ),
});

const AddProspectNoteSchema = z.object({
  prospectId: z.string().uuid('Prospect ID doit être un UUID'),
  contenu: z.string().trim().min(1, 'Le contenu est requis').max(2000),
});

const ConvertProspectSchema = z.object({
  id: z.string().uuid('Prospect ID doit être un UUID'),
});

const DeleteProspectSchema = z.object({
  id: z.string().uuid('Prospect ID doit être un UUID'),
});

async function getAuth() {
  const auth = await requireAuth();
  if (!auth.ok) {
    const supabase = await createClient();
    return {
      supabase,
      user: null,
      role: null,
      pipelineAccess: false,
    };
  }
  const { supabase, user } = auth;
  const { data } = await supabase
    .from('users')
    .select('role, pipeline_access')
    .eq('id', user.id)
    .single();
  return {
    supabase,
    user,
    role: data?.role ?? null,
    pipelineAccess: data?.pipeline_access ?? false,
  };
}

// ---------------------------------------------------------------------------
// Load prospect details (for side panel)
// ---------------------------------------------------------------------------

export async function loadProspectDetails(id: string) {
  const parsed = LoadProspectDetailsSchema.safeParse({ id });
  if (!parsed.success) {
    return { prospect: null, notes: [], convertedClient: null, rdvs: [] };
  }

  const auth = await requireAuth();
  if (!auth.ok) {
    return { prospect: null, notes: [], convertedClient: null, rdvs: [] };
  }
  const { supabase } = auth;

  const [prospectResult, notesResult, rdvsResult] = await Promise.all([
    supabase
      .from('prospects')
      .select(
        '*, commercial:users!prospects_commercial_id_fkey(id, nom, prenom), client:clients(id, raison_sociale)',
      )
      .eq('id', parsed.data.id)
      .maybeSingle(),
    supabase
      .from('prospect_notes')
      .select(
        '*, user:users!prospect_notes_user_id_fkey(id, nom, prenom, role)',
      )
      .eq('prospect_id', parsed.data.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('rdv_commerciaux')
      .select(
        '*, commercial:users!rdv_commerciaux_commercial_id_fkey(id, nom, prenom)',
      )
      .eq('prospect_id', parsed.data.id)
      .order('date_prevue', { ascending: false }),
  ]);

  const prospect = prospectResult.data;
  const notes = notesResult.data ?? [];
  const rdvs = rdvsResult.data ?? [];
  const convertedClient = prospect?.client
    ? {
        id: prospect.client.id,
        raison_sociale: prospect.client.raison_sociale,
      }
    : null;

  return { prospect, notes, convertedClient, rdvs };
}

// ---------------------------------------------------------------------------
// Update stage (drag-drop)
// ---------------------------------------------------------------------------

export async function updateProspectStage(
  id: string,
  stage: StageProspect,
): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateProspectStageSchema.safeParse({ id, stage });
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

  const { error } = await supabase
    .from('prospects')
    .update({ stage: parsed.data.stage })
    .eq('id', parsed.data.id);

  if (error) {
    logger.error('actions.prospects', 'updateProspectStage failed', {
      id: parsed.data.id,
      stage: parsed.data.stage,
      error,
    });
    return { success: false, error: error.message };
  }

  logAudit(
    'prospect_stage_updated',
    'prospect',
    parsed.data.id,
    { stage: parsed.data.stage },
    user.id,
  );
  revalidatePath('/commercial/pipeline');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Update commercial assignment
// ---------------------------------------------------------------------------

export async function updateProspectAssignment(
  id: string,
  commercialId: string | null,
): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateProspectAssignmentSchema.safeParse({ id, commercialId });
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

  const { error } = await supabase
    .from('prospects')
    .update({ commercial_id: parsed.data.commercialId })
    .eq('id', parsed.data.id);

  if (error) {
    logger.error('actions.prospects', 'updateProspectAssignment failed', {
      id: parsed.data.id,
      commercialId: parsed.data.commercialId,
      error,
    });
    return { success: false, error: error.message };
  }

  logAudit(
    'prospect_assigned',
    'prospect',
    parsed.data.id,
    { commercialId: parsed.data.commercialId },
    user.id,
  );
  revalidatePath('/commercial/pipeline');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Bulk update (assignment + stage)
// ---------------------------------------------------------------------------

export async function bulkUpdateProspects(
  ids: string[],
  patch: { commercialId?: string | null; stage?: StageProspect },
): Promise<{ success: boolean; updated?: number; error?: string }> {
  const parsed = BulkUpdateProspectsSchema.safeParse({ ids, patch });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const update: Database['public']['Tables']['prospects']['Update'] = {};
  if (parsed.data.patch.commercialId !== undefined)
    update.commercial_id = parsed.data.patch.commercialId;
  if (parsed.data.patch.stage !== undefined)
    update.stage = parsed.data.patch.stage;

  const { supabase, user, role, pipelineAccess } = await getAuth();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!canAccessPipeline(role, pipelineAccess)) {
    return { success: false, error: 'Accès refusé' };
  }

  const { error } = await supabase
    .from('prospects')
    .update(update)
    .in('id', parsed.data.ids);

  if (error) {
    logger.error('actions.prospects', 'bulkUpdateProspects failed', {
      count: parsed.data.ids.length,
      patch: parsed.data.patch,
      error,
    });
    return { success: false, error: error.message };
  }

  logAudit(
    'prospects_bulk_updated',
    'prospect',
    undefined,
    {
      count: parsed.data.ids.length,
      patch: parsed.data.patch,
    },
    user.id,
  );
  revalidatePath('/commercial/pipeline');
  return { success: true, updated: parsed.data.ids.length };
}

// ---------------------------------------------------------------------------
// Add note
// ---------------------------------------------------------------------------

export async function addProspectNote(
  prospectId: string,
  contenu: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = AddProspectNoteSchema.safeParse({ prospectId, contenu });
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

  const { error } = await supabase.from('prospect_notes').insert({
    prospect_id: parsed.data.prospectId,
    user_id: user.id,
    contenu: parsed.data.contenu,
  });

  if (error) return { success: false, error: error.message };

  logAudit(
    'note_added',
    'prospect',
    parsed.data.prospectId,
    undefined,
    user.id,
  );
  revalidatePath('/commercial/pipeline');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Convert signed prospect to client
// ---------------------------------------------------------------------------

export async function convertProspectToClient(
  id: string,
): Promise<{ success: boolean; clientId?: string; error?: string }> {
  const parsed = ConvertProspectSchema.safeParse({ id });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const { supabase, user, role } = await getAuth();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!isAdmin(role)) {
    return {
      success: false,
      error: 'Seuls les admins peuvent convertir un prospect en client',
    };
  }

  const { data: prospect, error: fetchError } = await supabase
    .from('prospects')
    .select('*')
    .eq('id', parsed.data.id)
    .single();

  if (fetchError || !prospect) {
    return { success: false, error: 'Prospect introuvable' };
  }

  if (prospect.stage !== 'signe') {
    return {
      success: false,
      error: 'Seuls les prospects signés peuvent être convertis',
    };
  }

  if (prospect.client_id) {
    return { success: false, error: 'Ce prospect a déjà été converti' };
  }

  const { data: client, error: insertError } = await supabase
    .from('clients')
    .insert({
      trigramme: '',
      raison_sociale: prospect.nom,
      siret: prospect.siret,
      apporteur_commercial_id: prospect.commercial_id,
      apporteur_date: new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .single();

  if (insertError || !client) {
    logger.error('actions.prospects', 'convertProspectToClient failed', {
      id: parsed.data.id,
      error: insertError,
    });
    return {
      success: false,
      error: insertError?.message || 'Erreur lors de la création du client',
    };
  }

  const { error: linkError } = await supabase
    .from('prospects')
    .update({ client_id: client.id })
    .eq('id', parsed.data.id);
  if (linkError) {
    // Le client est cree mais le prospect n est pas lie : etat partiellement
    // incoherent (admin verra le client dans la liste mais le prospect reste
    // 'signe' sans client_id). On loggue mais on ne fail pas l action - le
    // client a ete cree avec succes, l user peut relier manuellement.
    logger.warn(
      'actions.prospects',
      'convertProspectToClient link prospect failed',
      {
        prospectId: parsed.data.id,
        clientId: client.id,
        error: linkError,
      },
    );
  }

  logAudit(
    'prospect_converted',
    'prospect',
    parsed.data.id,
    { clientId: client.id },
    user.id,
  );
  revalidatePath('/commercial/pipeline');
  revalidatePath('/admin/clients');
  return { success: true, clientId: client.id };
}

// ---------------------------------------------------------------------------
// Delete prospect (admin only, soft delete via archive=true)
// ---------------------------------------------------------------------------

export async function deleteProspect(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = DeleteProspectSchema.safeParse({ id });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const { supabase, user, role } = await getAuth();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!isAdmin(role)) {
    return {
      success: false,
      error: 'Seuls les admins peuvent supprimer un prospect',
    };
  }

  const { error } = await supabase
    .from('prospects')
    .update({ archive: true })
    .eq('id', parsed.data.id);

  if (error) {
    logger.error('actions.prospects', 'deleteProspect failed', {
      id: parsed.data.id,
      error,
    });
    return { success: false, error: error.message };
  }

  logAudit('prospect_deleted', 'prospect', parsed.data.id, undefined, user.id);
  revalidatePath('/commercial/pipeline');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Import from Excel
// ---------------------------------------------------------------------------

interface ExcelRow {
  nom?: string;
  region?: string;
  siret?: string;
  volume?: number;
  dirigeant_nom?: string;
  dirigeant_telephone?: string;
  dirigeant_email?: string;
  stage: StageProspect;
  site_web?: string;
  emails_generiques?: string;
  telephone_standard?: string;
  dirigeant_poste?: string;
  notes_import?: string;
}

function mapStageFromColumns(row: Record<string, unknown>): StageProspect {
  const truthy = (v: unknown) => {
    if (!v) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') {
      const lower = v.trim().toLowerCase();
      return (
        lower !== '' &&
        lower !== '0' &&
        lower !== 'false' &&
        lower !== 'non' &&
        lower !== 'no'
      );
    }
    return true;
  };

  if (truthy(row['Contractualisé'])) return 'signe';
  if (truthy(row['R2 validé'])) return 'cadre';
  if (truthy(row['R1 validé'])) return 'presente';
  return 'a_qualifier';
}

function normalizeSiret(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).replace(/\D/g, '');
  return s.length > 0 ? s : null;
}

function mapRow(row: Record<string, unknown>): ExcelRow | null {
  const nom = row['Nom du CFA'];
  if (!nom || String(nom).trim() === '') return null;

  const volumeRaw = row["Nombre d'apprentis"];
  const volume =
    typeof volumeRaw === 'number'
      ? volumeRaw
      : volumeRaw
        ? parseInt(String(volumeRaw).replace(/\D/g, ''), 10) || undefined
        : undefined;

  return {
    nom: String(nom).trim(),
    region: row['Région'] ? String(row['Région']).trim() : undefined,
    siret: normalizeSiret(row['SIRET']) ?? undefined,
    volume,
    dirigeant_nom: row['Nom du dirigeant']
      ? String(row['Nom du dirigeant']).trim()
      : undefined,
    dirigeant_telephone: row['Téléphone']
      ? String(row['Téléphone']).trim()
      : undefined,
    dirigeant_email: row['Mail du dirigeant']
      ? String(row['Mail du dirigeant']).trim()
      : undefined,
    dirigeant_poste: row['Poste'] ? String(row['Poste']).trim() : undefined,
    site_web: row['Site web'] ? String(row['Site web']).trim() : undefined,
    emails_generiques: row['Emails génériques']
      ? String(row['Emails génériques']).trim()
      : undefined,
    telephone_standard: row['Tél standard']
      ? String(row['Tél standard']).trim()
      : undefined,
    notes_import: row['Notes'] ? String(row['Notes']).trim() : undefined,
    stage: mapStageFromColumns(row),
  };
}

// Schema valide le File extrait de FormData (pas le FormData lui-meme).
const ImportFileSchema = z.object({
  size: z
    .number()
    .int()
    .positive('Aucun fichier fourni')
    .max(20 * 1024 * 1024, 'Le fichier dépasse 20 Mo'),
  name: z.string().max(500).optional(),
});

export async function importProspectsFromExcel(formData: FormData): Promise<{
  success: boolean;
  created?: number;
  updated?: number;
  skipped?: number;
  error?: string;
}> {
  const { supabase, user, role } = await getAuth();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!isAdmin(role)) {
    return {
      success: false,
      error: 'Seuls les admins peuvent importer un fichier',
    };
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return { success: false, error: 'Aucun fichier fourni' };
  }

  // Valider apres extraction du File (pas le FormData lui-meme).
  const parsed = ImportFileSchema.safeParse({
    size: file.size,
    name: file.name,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Fichier invalide',
    };
  }

  let workbook: XLSX.WorkBook;
  try {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: 'array' });
  } catch (err) {
    logger.error('actions.prospects', 'xlsx parse failed', { error: err });
    return { success: false, error: 'Fichier Excel illisible' };
  }

  // Process sheets: raw first, then enriched ("Inf à 50") so enriched wins on SIRET collision
  const sheetOrder = workbook.SheetNames.toSorted((a) =>
    a.toLowerCase().includes('inf') ? 1 : -1,
  );

  const rows: ExcelRow[] = [];
  for (const sheetName of sheetOrder) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
    });
    for (const raw of json) {
      const mapped = mapRow(raw);
      if (mapped) rows.push(mapped);
    }
  }

  if (rows.length === 0) {
    return { success: false, error: 'Aucune ligne exploitable trouvée' };
  }

  // Dedup by SIRET within the import (keep last occurrence — enriched sheet processed last)
  const bySiret = new Map<string, ExcelRow>();
  const withoutSiret: ExcelRow[] = [];
  for (const row of rows) {
    if (row.siret) bySiret.set(row.siret, row);
    else withoutSiret.push(row);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  // Upsert rows with SIRET
  if (bySiret.size > 0) {
    const payload = Array.from(bySiret.values()).map((r) => ({
      type_prospect: 'cfa' as TypeProspect,
      nom: r.nom!,
      region: r.region ?? null,
      siret: r.siret!,
      volume_apprenants: r.volume ?? null,
      dirigeant_nom: r.dirigeant_nom ?? null,
      dirigeant_email: r.dirigeant_email ?? null,
      dirigeant_telephone: r.dirigeant_telephone ?? null,
      dirigeant_poste: r.dirigeant_poste ?? null,
      site_web: r.site_web ?? null,
      emails_generiques: r.emails_generiques ?? null,
      telephone_standard: r.telephone_standard ?? null,
      notes_import: r.notes_import ?? null,
      stage: r.stage,
    }));

    // Chunk upsert to avoid payload-size issues
    const CHUNK = 500;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const slice = payload.slice(i, i + CHUNK);

      // Find existing SIRETs first to count created vs updated
      const sirets = slice.map((s) => s.siret!);
      // oxlint-disable-next-line react-doctor/async-await-in-loop
      const { data: existing } = await supabase
        .from('prospects')
        .select('siret')
        .in('siret', sirets);

      const existingSet = new Set(existing?.map((e) => e.siret) ?? []);
      created += slice.length - existingSet.size;
      updated += existingSet.size;

      const { error } = await supabase
        .from('prospects')
        .upsert(slice, { onConflict: 'siret', ignoreDuplicates: false });

      if (error) {
        logger.error('actions.prospects', 'upsert chunk failed', {
          error,
          index: i,
        });
        return {
          success: false,
          created,
          updated,
          skipped,
          error: error.message,
        };
      }
    }
  }

  // Insert rows without SIRET (no dedup possible — insert as-is)
  if (withoutSiret.length > 0) {
    const payload = withoutSiret.map((r) => ({
      type_prospect: 'cfa' as TypeProspect,
      nom: r.nom!,
      region: r.region ?? null,
      volume_apprenants: r.volume ?? null,
      dirigeant_nom: r.dirigeant_nom ?? null,
      dirigeant_email: r.dirigeant_email ?? null,
      dirigeant_telephone: r.dirigeant_telephone ?? null,
      dirigeant_poste: r.dirigeant_poste ?? null,
      site_web: r.site_web ?? null,
      emails_generiques: r.emails_generiques ?? null,
      telephone_standard: r.telephone_standard ?? null,
      notes_import: r.notes_import ?? null,
      stage: r.stage,
    }));

    const CHUNK = 500;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const slice = payload.slice(i, i + CHUNK);
      // oxlint-disable-next-line react-doctor/async-await-in-loop
      const { error } = await supabase.from('prospects').insert(slice);
      if (error) {
        logger.error('actions.prospects', 'insert no-siret chunk failed', {
          error,
          index: i,
        });
        skipped += slice.length;
      } else {
        created += slice.length;
      }
    }
  }

  logAudit(
    'prospects_imported',
    'prospect',
    undefined,
    {
      created,
      updated,
      skipped,
    },
    user.id,
  );
  revalidatePath('/commercial/pipeline');
  return { success: true, created, updated, skipped };
}

// ---------------------------------------------------------------------------
// Création d'un prospect + enrichissement INSEE + détection de doublons
// ---------------------------------------------------------------------------

const CANAL_VALUES = [
  'reseau_developpeur',
  'reseau_direction',
  'linkedin_auto',
  'salon',
  'apporteur',
  'autre',
] as const;

const CreateProspectSchema = z.object({
  nom: z
    .string()
    .trim()
    .min(2, 'Raison sociale requise (2 caractères min)')
    .max(200),
  typeProspect: z.enum(['cfa', 'entreprise'], { message: 'Type invalide' }),
  canalOrigine: z.enum(CANAL_VALUES).optional(),
  siren: z
    .string()
    .trim()
    .regex(/^\d{9}$/, 'SIREN = 9 chiffres')
    .optional(),
  volumeApprenants: z.number().int().positive().max(1_000_000).optional(),
  notes: z.string().trim().max(2000).optional(),
  forceCreate: z.boolean().optional(),
});

/** Appelle la RPC pg_trgm de détection de doublons (partagé create/check). */
async function runDuplicateCheck(
  supabase: Awaited<ReturnType<typeof createClient>>,
  nom: string,
  siren: string | null,
): Promise<ProspectDuplicate[]> {
  const cleanNom = nom.trim();
  if (cleanNom.length < 2) return [];
  const { data, error } = await supabase.rpc(
    'find_prospect_duplicates' as never,
    {
      p_nom: cleanNom,
      p_siren: siren ? normalizeSiren(siren) : null,
    } as never,
  );
  if (error) {
    logger.error('actions.prospects', 'find_prospect_duplicates failed', {
      error,
    });
    return [];
  }
  return ((data as ProspectDuplicate[] | null) ?? []).map((d) => ({
    ...d,
    similarite: Number(d.similarite),
  }));
}

export async function checkProspectDuplicates(
  nom: string,
  siren?: string | null,
): Promise<ProspectDuplicate[]> {
  const { supabase, user, role, pipelineAccess } = await getAuth();
  if (!user || !canAccessPipeline(role, pipelineAccess)) return [];
  return runDuplicateCheck(supabase, nom, siren ?? null);
}

export async function lookupSiren(
  siren: string,
): Promise<EntrepriseInsee | null> {
  const { user, role, pipelineAccess } = await getAuth();
  if (!user || !canAccessPipeline(role, pipelineAccess)) return null;
  return lookupEntrepriseBySiren(siren);
}

export async function createProspect(input: {
  nom: string;
  typeProspect: TypeProspect;
  canalOrigine?: CanalOrigine;
  siren?: string;
  volumeApprenants?: number;
  notes?: string;
  forceCreate?: boolean;
}): Promise<{
  success: boolean;
  id?: string;
  duplicates?: ProspectDuplicate[];
  error?: string;
}> {
  const parsed = CreateProspectSchema.safeParse(input);
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

  const data = parsed.data;

  // Détection de doublons bloquante (Feature 2 §7). Override réservé Direction.
  if (!data.forceCreate) {
    const dups = await runDuplicateCheck(
      supabase,
      data.nom,
      data.siren ?? null,
    );
    if (dups.length > 0) {
      return {
        success: false,
        duplicates: dups,
        error: 'Un prospect similaire existe déjà',
      };
    }
  } else if (!isAdmin(role)) {
    return {
      success: false,
      error: 'Seule la Direction peut forcer la création malgré un doublon',
    };
  }

  // Enrichissement INSEE best-effort si un SIREN est fourni.
  let identite: Partial<Database['public']['Tables']['prospects']['Insert']> =
    {};
  let nomFinal = data.nom;
  if (data.siren) {
    const e = await lookupEntrepriseBySiren(data.siren);
    if (e) {
      nomFinal = e.raisonSociale || data.nom;
      identite = {
        siren: e.siren,
        siret: e.siret,
        adresse: e.adresse,
        forme_juridique: e.formeJuridique,
        code_naf: e.codeNaf,
        effectif_tranche: e.effectifTranche,
        insee_verifie: true,
      };
    } else {
      identite = { siren: data.siren, insee_verifie: false };
    }
  }

  const { data: created, error } = await supabase
    .from('prospects')
    .insert({
      nom: nomFinal,
      type_prospect: data.typeProspect,
      canal_origine: data.canalOrigine ?? null,
      volume_apprenants: data.volumeApprenants ?? null,
      commercial_id: user.id,
      ...identite,
    })
    .select('id')
    .single();

  if (error || !created) {
    logger.error('actions.prospects', 'createProspect failed', { error });
    if (error?.code === '23505') {
      return { success: false, error: 'Un prospect avec ce SIRET existe déjà' };
    }
    return { success: false, error: error?.message ?? 'Création impossible' };
  }

  if (data.notes?.trim()) {
    await supabase.from('prospect_notes').insert({
      prospect_id: created.id,
      user_id: user.id,
      contenu: data.notes.trim(),
    });
  }

  logAudit(
    'prospect_created',
    'prospect',
    created.id,
    {
      canal: data.canalOrigine ?? null,
      insee: identite.insee_verifie ?? false,
    },
    user.id,
  );
  revalidatePath('/commercial/pipeline');
  revalidatePath('/commercial/prospects');
  return { success: true, id: created.id };
}

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
  revalidatePath('/commercial/pipeline');
  return { success: true };
}
