'use server';

import { revalidatePath } from 'next/cache';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/server';
import { canAccessPipeline, isAdmin } from '@/lib/utils/roles';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import type { Database } from '@/types/database';

type StageProspect = Database['public']['Enums']['stage_prospect'];
type TypeProspect = Database['public']['Enums']['type_prospect'];

const STAGE_VALUES: StageProspect[] = ['non_contacte', 'r1', 'r2', 'signe'];

async function getCaller() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      supabase,
      user: null,
      role: null,
      pipelineAccess: false,
    };
  }
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { prospect: null, notes: [], convertedClient: null };
  }

  const [prospectResult, notesResult] = await Promise.all([
    supabase
      .from('prospects')
      .select(
        '*, commercial:users!prospects_commercial_id_fkey(id, nom, prenom), client:clients(id, raison_sociale)',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('prospect_notes')
      .select(
        '*, user:users!prospect_notes_user_id_fkey(id, nom, prenom, role)',
      )
      .eq('prospect_id', id)
      .order('created_at', { ascending: false }),
  ]);

  const prospect = prospectResult.data;
  const notes = notesResult.data ?? [];
  const convertedClient = prospect?.client
    ? {
        id: prospect.client.id,
        raison_sociale: prospect.client.raison_sociale,
      }
    : null;

  return { prospect, notes, convertedClient };
}

// ---------------------------------------------------------------------------
// Update stage (drag-drop)
// ---------------------------------------------------------------------------

export async function updateProspectStage(
  id: string,
  stage: StageProspect,
): Promise<{ success: boolean; error?: string }> {
  if (!STAGE_VALUES.includes(stage)) {
    return { success: false, error: 'Stage invalide' };
  }

  const { supabase, user, role, pipelineAccess } = await getCaller();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!canAccessPipeline(role, pipelineAccess)) {
    return { success: false, error: 'Accès refusé' };
  }

  const { error } = await supabase
    .from('prospects')
    .update({ stage })
    .eq('id', id);

  if (error) {
    logger.error('actions.prospects', 'updateProspectStage failed', {
      id,
      stage,
      error,
    });
    return { success: false, error: error.message };
  }

  logAudit('prospect_stage_updated', 'prospect', id, { stage });
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
  const { supabase, user, role, pipelineAccess } = await getCaller();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!canAccessPipeline(role, pipelineAccess)) {
    return { success: false, error: 'Accès refusé' };
  }

  const { error } = await supabase
    .from('prospects')
    .update({ commercial_id: commercialId })
    .eq('id', id);

  if (error) {
    logger.error('actions.prospects', 'updateProspectAssignment failed', {
      id,
      commercialId,
      error,
    });
    return { success: false, error: error.message };
  }

  logAudit('prospect_assigned', 'prospect', id, { commercialId });
  revalidatePath('/commercial/pipeline');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Add note
// ---------------------------------------------------------------------------

export async function addProspectNote(
  prospectId: string,
  contenu: string,
): Promise<{ success: boolean; error?: string }> {
  if (!contenu?.trim()) {
    return { success: false, error: 'Le contenu est requis' };
  }

  const { supabase, user, role, pipelineAccess } = await getCaller();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!canAccessPipeline(role, pipelineAccess)) {
    return { success: false, error: 'Accès refusé' };
  }

  const { error } = await supabase.from('prospect_notes').insert({
    prospect_id: prospectId,
    user_id: user.id,
    contenu: contenu.trim(),
  });

  if (error) return { success: false, error: error.message };

  logAudit('note_added', 'prospect', prospectId);
  revalidatePath('/commercial/pipeline');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Convert signed prospect to client
// ---------------------------------------------------------------------------

export async function convertProspectToClient(
  id: string,
): Promise<{ success: boolean; clientId?: string; error?: string }> {
  const { supabase, user, role } = await getCaller();
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
    .eq('id', id)
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
    })
    .select('id')
    .single();

  if (insertError || !client) {
    logger.error('actions.prospects', 'convertProspectToClient failed', {
      id,
      error: insertError,
    });
    return {
      success: false,
      error: insertError?.message || 'Erreur lors de la création du client',
    };
  }

  await supabase
    .from('prospects')
    .update({ client_id: client.id })
    .eq('id', id);

  logAudit('prospect_converted', 'prospect', id, { clientId: client.id });
  revalidatePath('/commercial/pipeline');
  revalidatePath('/admin/clients');
  return { success: true, clientId: client.id };
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
  if (truthy(row['R2 validé'])) return 'r2';
  if (truthy(row['R1 validé'])) return 'r1';
  return 'non_contacte';
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

export async function importProspectsFromExcel(formData: FormData): Promise<{
  success: boolean;
  created?: number;
  updated?: number;
  skipped?: number;
  error?: string;
}> {
  const { supabase, user, role } = await getCaller();
  if (!user) return { success: false, error: 'Non authentifié' };
  if (!isAdmin(role)) {
    return {
      success: false,
      error: 'Seuls les admins peuvent importer un fichier',
    };
  }

  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) {
    return { success: false, error: 'Aucun fichier fourni' };
  }

  if (file.size > 20 * 1024 * 1024) {
    return { success: false, error: 'Le fichier dépasse 20 Mo' };
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
  const sheetOrder = [...workbook.SheetNames].sort((a) =>
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

  logAudit('prospects_imported', 'prospect', undefined, {
    created,
    updated,
    skipped,
  });
  revalidatePath('/commercial/pipeline');
  return { success: true, created, updated, skipped };
}
