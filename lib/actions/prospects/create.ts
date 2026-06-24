'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { createClient } from '@/lib/supabase/server';
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
import {
  getAuth,
  CANAL_VALUES,
  type TypeProspect,
  type CanalOrigine,
} from './shared';

// ---------------------------------------------------------------------------
// Création d'un prospect + enrichissement INSEE + détection de doublons
// ---------------------------------------------------------------------------

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
  revalidatePath('/commercial/prospects');
  revalidatePath('/commercial/prospects');
  return { success: true, id: created.id };
}
