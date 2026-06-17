'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAuth, checkAuth } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import { nextRoundRobinDeveloppeur } from '@/lib/utils/round-robin';
import {
  getLastLinkedinEventForProspect,
  type LinkedinEventRecord,
} from '@/lib/queries/linkedin';
import type { Database } from '@/types/database';

type StatutEvenementLinkedin =
  Database['public']['Enums']['statut_evenement_linkedin'];

// ---------------------------------------------------------------------------
// Réglages métier
// ---------------------------------------------------------------------------

// Seuil de similarité (find_prospect_duplicates) au-delà duquel on rattache
// l'évènement à un prospect existant plutôt que d'en créer un nouveau.
const MATCH_THRESHOLD = 0.8;
// Fenêtre de dédoublonnage : un même profil capté à nouveau sous ce délai est
// considéré comme un doublon et ignoré.
const RECENT_WINDOW_DAYS = 7;
// Fenêtre d'équité round-robin : on pondère par les prospects LinkedIn récents.
const ROUND_ROBIN_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

// Seuls ces types d'évènement valent un lead qualifié ("réponse positive").
// Une simple connexion acceptée n'enclenche pas la création d'un prospect.
const POSITIVE_EVENT_TYPES = [
  'reponse_positive',
  'mention_interet',
  'rdv_demande',
] as const;

// ---------------------------------------------------------------------------
// Contrat du payload reçu par le webhook (cf. app/api/webhooks/linkedin)
// ---------------------------------------------------------------------------

const PayloadSchema = z.object({
  outil_source: z.string().trim().max(120).nullish(),
  type_evenement: z.enum(
    [
      'reponse_positive',
      'connexion_acceptee',
      'mention_interet',
      'rdv_demande',
    ],
    { message: 'type_evenement inconnu' },
  ),
  linkedin_profil_url: z.string().trim().max(2000).nullish(),
  linkedin_company_url: z.string().trim().max(2000).nullish(),
  linkedin_company_name: z.string().trim().max(300).nullish(),
  prenom_nom: z.string().trim().max(200).nullish(),
  fonction: z.string().trim().max(200).nullish(),
  contenu_message: z.string().trim().max(10_000).nullish(),
  date_evenement: z.string().trim().max(40).nullish(),
});

/** Contrat JSON accepté par le connecteur LinkedIn. */
export type LinkedinEventPayload = z.infer<typeof PayloadSchema>;

export interface IngestResult {
  success: boolean;
  eventId?: string;
  statut?: StatutEvenementLinkedin;
  prospectId?: string;
  raison?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers d'ingestion (service-role : RLS contournée côté webhook)
// ---------------------------------------------------------------------------

type AdminClient = SupabaseClient<Database>;

/** Crée l'interlocuteur capté (prospect_contacts) si un nom est fourni. */
async function createInterlocuteur(
  admin: AdminClient,
  prospectId: string,
  payload: LinkedinEventPayload,
): Promise<string | null> {
  const nom = payload.prenom_nom?.trim();
  if (!nom) return null;
  const { data, error } = await admin
    .from('prospect_contacts')
    .insert({
      prospect_id: prospectId,
      nom,
      poste: payload.fonction?.trim() || null,
      linkedin: payload.linkedin_profil_url?.trim() || null,
    })
    .select('id')
    .single();
  if (error || !data) {
    logger.warn('actions.linkedin', 'interlocuteur non créé', { error });
    return null;
  }
  return data.id;
}

/** Inscrit l'évènement au journal du prospect (prospect_communications). */
async function appendJournal(
  admin: AdminClient,
  prospectId: string,
  payload: LinkedinEventPayload,
): Promise<void> {
  const message = payload.contenu_message?.trim() ?? '';
  await admin.from('prospect_communications').insert({
    prospect_id: prospectId,
    // Type libre : repris tel quel par la timeline de la fiche (Feature 2).
    type: 'linkedin_auto',
    sujet: message.slice(0, 280) || 'Évènement LinkedIn capté',
    destinataire: payload.linkedin_profil_url?.trim() || null,
    user_id: null,
  });
}

/**
 * Détermine le développeur affecté : d'abord une règle de mapping (regex sur la
 * société, par priorité), sinon le round-robin équitable sur les commerciaux
 * actifs. Peut renvoyer `null` (aucun commercial actif).
 */
async function resolveDeveloppeur(
  admin: AdminClient,
  companyName: string,
  companyUrl: string | null,
): Promise<string | null> {
  // 1. Règles de mapping (regex, priorité croissante).
  const { data: rules } = await admin
    .from('linkedin_mapping_rules')
    .select('linkedin_company_pattern, developpeur_affecte_id')
    .eq('actif', true)
    .order('priorite', { ascending: true })
    .order('created_at', { ascending: true });

  const haystacks = [companyName, companyUrl ?? ''].filter((s) => s.length > 0);
  for (const rule of rules ?? []) {
    if (!rule.developpeur_affecte_id) continue;
    let regex: RegExp;
    try {
      regex = new RegExp(rule.linkedin_company_pattern, 'i');
    } catch {
      logger.warn('actions.linkedin', 'regex de règle invalide', {
        pattern: rule.linkedin_company_pattern,
      });
      continue;
    }
    if (haystacks.some((h) => regex.test(h))) {
      return rule.developpeur_affecte_id;
    }
  }

  // 2. Round-robin équitable sur les commerciaux actifs.
  const { data: devs } = await admin
    .from('users')
    .select('id')
    .eq('role', 'commercial')
    .eq('actif', true)
    .order('id', { ascending: true });
  const devIds = (devs ?? []).map((d) => d.id);
  if (devIds.length === 0) return null;

  const since = new Date(
    Date.now() - ROUND_ROBIN_WINDOW_DAYS * DAY_MS,
  ).toISOString();
  const { data: recent } = await admin
    .from('prospects')
    .select('commercial_id')
    .eq('canal_origine', 'linkedin_auto')
    .gte('created_at', since)
    .not('commercial_id', 'is', null);

  const chargeParDev: Record<string, number> = {};
  for (const row of recent ?? []) {
    const id = row.commercial_id;
    if (id) chargeParDev[id] = (chargeParDev[id] ?? 0) + 1;
  }
  return nextRoundRobinDeveloppeur(devIds, chargeParDev);
}

// ---------------------------------------------------------------------------
// Ingestion d'un évènement LinkedIn (appelée par le webhook, service-role)
// ---------------------------------------------------------------------------

/**
 * Pipeline d'ingestion :
 *   1. Persiste l'évènement (statut `nouveau`).
 *   2. Filtre qualité (type qualifiant + message + société + pas déjà client).
 *   3. Dédoublonnage (même profil < 7 jours).
 *   4. Matching prospect (find_prospect_duplicates, seuil ≥ 0.8) :
 *        - Cas A : enrichit le prospect existant (journal + interlocuteur).
 *        - Cas B : crée un prospect `a_qualifier` canal `linkedin_auto`.
 *   5. Affecte (règle de mapping sinon round-robin) + notifie le développeur.
 *   6. Marque l'évènement `traite`.
 * Tout rejet de qualité → `ignore` + `raison_ignore`. Toute erreur → `erreur`.
 */
export async function ingestLinkedinEvent(
  rawPayload: unknown,
): Promise<IngestResult> {
  const parsed = PayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Payload invalide',
    };
  }
  const payload = parsed.data;
  const admin = createAdminClient();
  const now = new Date();

  const companyName = payload.linkedin_company_name?.trim() ?? '';
  const contenu = payload.contenu_message?.trim() ?? '';
  const profilUrl = payload.linkedin_profil_url?.trim() || null;

  // date_evenement : normalisée en ISO si parseable, sinon null.
  let dateEvenement: string | null = null;
  if (payload.date_evenement) {
    const d = new Date(payload.date_evenement);
    if (!Number.isNaN(d.getTime())) dateEvenement = d.toISOString();
  }

  // 1. Persistance (statut `nouveau`) : trace durable même si la suite échoue.
  const { data: created, error: insertErr } = await admin
    .from('linkedin_events')
    .insert({
      outil_source: payload.outil_source?.trim() || null,
      type_evenement: payload.type_evenement,
      linkedin_profil_url: profilUrl,
      linkedin_company_url: payload.linkedin_company_url?.trim() || null,
      linkedin_company_name: companyName || null,
      prenom_nom: payload.prenom_nom?.trim() || null,
      fonction: payload.fonction?.trim() || null,
      contenu_message: contenu || null,
      date_evenement: dateEvenement,
      statut: 'nouveau',
    })
    .select('id')
    .single();

  if (insertErr || !created) {
    logger.error('actions.linkedin', 'event insert failed', {
      error: insertErr,
    });
    return {
      success: false,
      error: insertErr?.message ?? 'Insertion impossible',
    };
  }
  const eventId = created.id;

  const markIgnore = async (raison: string): Promise<IngestResult> => {
    await admin
      .from('linkedin_events')
      .update({
        statut: 'ignore',
        raison_ignore: raison,
        traite_le: now.toISOString(),
      })
      .eq('id', eventId);
    logger.info('actions.linkedin', 'event ignoré', { eventId, raison });
    return { success: true, eventId, statut: 'ignore', raison };
  };

  try {
    // 2. Filtre qualité.
    const positif = (POSITIVE_EVENT_TYPES as readonly string[]).includes(
      payload.type_evenement,
    );
    if (!positif) {
      return await markIgnore('Type non qualifiant (pas de réponse positive)');
    }
    if (!contenu) return await markIgnore('Message vide');
    if (!companyName) return await markIgnore('Entreprise non nommée');

    const { data: existingClients } = await admin
      .from('clients')
      .select('id')
      .eq('archive', false)
      .ilike('raison_sociale', companyName)
      .limit(1);
    if (existingClients && existingClients.length > 0) {
      return await markIgnore('Entreprise déjà cliente');
    }

    // 3. Dédoublonnage évènement (même profil < 7 jours).
    if (profilUrl) {
      const since = new Date(
        now.getTime() - RECENT_WINDOW_DAYS * DAY_MS,
      ).toISOString();
      const { data: dupEvents } = await admin
        .from('linkedin_events')
        .select('id')
        .eq('linkedin_profil_url', profilUrl)
        .neq('id', eventId)
        .neq('statut', 'ignore')
        .gte('created_at', since)
        .limit(1);
      if (dupEvents && dupEvents.length > 0) {
        return await markIgnore('Doublon évènement (même profil < 7 jours)');
      }
    }

    // 4. Matching prospect existant (seuil ≥ 0.8).
    const { data: dups } = await admin.rpc('find_prospect_duplicates', {
      p_nom: companyName,
    });
    const match = (dups ?? [])
      .map((d) => ({ id: d.id, similarite: Number(d.similarite) }))
      .filter((d) => d.similarite >= MATCH_THRESHOLD)
      .sort((a, b) => b.similarite - a.similarite)[0];

    let prospectId: string;
    let interlocuteurId: string | null = null;
    let developpeurId: string | null = null;
    const enrichi = Boolean(match);

    if (match) {
      // Cas A : enrichir un prospect existant (pas de réaffectation).
      prospectId = match.id;
      const { data: existing } = await admin
        .from('prospects')
        .select('commercial_id')
        .eq('id', prospectId)
        .single();
      developpeurId = existing?.commercial_id ?? null;
      interlocuteurId = await createInterlocuteur(admin, prospectId, payload);
      await appendJournal(admin, prospectId, payload);
      await admin
        .from('prospects')
        .update({ derniere_action_at: now.toISOString() })
        .eq('id', prospectId);
    } else {
      // Cas B : créer un prospect `a_qualifier` canal `linkedin_auto`.
      developpeurId = await resolveDeveloppeur(
        admin,
        companyName,
        payload.linkedin_company_url?.trim() || null,
      );
      const { data: prospect, error: prospErr } = await admin
        .from('prospects')
        .insert({
          nom: companyName,
          type_prospect: 'entreprise',
          stage: 'a_qualifier',
          canal_origine: 'linkedin_auto',
          commercial_id: developpeurId,
        })
        .select('id')
        .single();
      if (prospErr || !prospect) {
        throw new Error(prospErr?.message ?? 'Création prospect impossible');
      }
      prospectId = prospect.id;
      interlocuteurId = await createInterlocuteur(admin, prospectId, payload);
      if (interlocuteurId) {
        await admin
          .from('prospects')
          .update({ contact_principal_id: interlocuteurId })
          .eq('id', prospectId);
      }
      await appendJournal(admin, prospectId, payload);
    }

    // 5. Notifier le développeur affecté.
    if (developpeurId) {
      await admin.from('notifications').insert({
        user_id: developpeurId,
        type: 'linkedin_prospect_cree',
        titre: enrichi
          ? 'Interaction LinkedIn sur un prospect'
          : 'Nouveau prospect LinkedIn',
        message: enrichi
          ? `${companyName} : nouvelle interaction LinkedIn captée.`
          : `${companyName} a manifesté de l'intérêt via LinkedIn.`,
        lien: `/commercial/prospects/${prospectId}`,
      });
    }

    // 6. Marquer l'évènement comme traité.
    await admin
      .from('linkedin_events')
      .update({
        statut: 'traite',
        traite_le: now.toISOString(),
        prospect_cree_id: prospectId,
        interlocuteur_cree_id: interlocuteurId,
      })
      .eq('id', eventId);

    logAudit('linkedin_event_traite', 'linkedin_event', eventId, {
      prospect_id: prospectId,
      cas: enrichi ? 'enrichissement' : 'creation',
      developpeur_id: developpeurId,
    });
    logger.info('actions.linkedin', 'event traité', {
      eventId,
      prospectId,
      enrichi,
    });
    return { success: true, eventId, statut: 'traite', prospectId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('actions.linkedin', 'ingest failed', {
      eventId,
      error: message,
    });
    await admin
      .from('linkedin_events')
      .update({
        statut: 'erreur',
        raison_ignore: message.slice(0, 500),
        traite_le: new Date().toISOString(),
      })
      .eq('id', eventId);
    return { success: false, eventId, statut: 'erreur', error: message };
  }
}

// ---------------------------------------------------------------------------
// CRUD des règles de mapping (admin seul)
// ---------------------------------------------------------------------------

function validateRegex(pattern: string): string | null {
  try {
    void new RegExp(pattern);
    return null;
  } catch (e) {
    return e instanceof Error
      ? `Motif regex invalide : ${e.message}`
      : 'Motif regex invalide';
  }
}

const AddRuleSchema = z.object({
  pattern: z.string().trim().min(1, 'Motif requis').max(500),
  developpeurAffecteId: z.string().uuid('Développeur invalide').nullish(),
  priorite: z.number().int().min(0).max(10_000).optional(),
  actif: z.boolean().optional(),
});

export async function addMappingRule(input: {
  pattern: string;
  developpeurAffecteId?: string | null;
  priorite?: number;
  actif?: boolean;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const parsed = AddRuleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  const regexErr = validateRegex(parsed.data.pattern);
  if (regexErr) return { success: false, error: regexErr };

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from('linkedin_mapping_rules')
    .insert({
      linkedin_company_pattern: parsed.data.pattern,
      developpeur_affecte_id: parsed.data.developpeurAffecteId ?? null,
      priorite: parsed.data.priorite ?? 100,
      actif: parsed.data.actif ?? true,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? 'Création impossible' };
  }
  logAudit(
    'linkedin_rule_created',
    'linkedin_mapping_rule',
    data.id,
    undefined,
    user.id,
  );
  revalidatePath('/commercial/linkedin');
  return { success: true, id: data.id };
}

const UpdateRuleSchema = z.object({
  id: z.string().uuid('Règle invalide'),
  pattern: z.string().trim().min(1, 'Motif requis').max(500).optional(),
  developpeurAffecteId: z.string().uuid('Développeur invalide').nullish(),
  priorite: z.number().int().min(0).max(10_000).optional(),
  actif: z.boolean().optional(),
});

export async function updateMappingRule(input: {
  id: string;
  pattern?: string;
  developpeurAffecteId?: string | null;
  priorite?: number;
  actif?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateRuleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  if (parsed.data.pattern !== undefined) {
    const regexErr = validateRegex(parsed.data.pattern);
    if (regexErr) return { success: false, error: regexErr };
  }

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const patch: Database['public']['Tables']['linkedin_mapping_rules']['Update'] =
    {};
  if (parsed.data.pattern !== undefined) {
    patch.linkedin_company_pattern = parsed.data.pattern;
  }
  if (parsed.data.developpeurAffecteId !== undefined) {
    patch.developpeur_affecte_id = parsed.data.developpeurAffecteId;
  }
  if (parsed.data.priorite !== undefined) patch.priorite = parsed.data.priorite;
  if (parsed.data.actif !== undefined) patch.actif = parsed.data.actif;

  const { error } = await supabase
    .from('linkedin_mapping_rules')
    .update(patch)
    .eq('id', parsed.data.id);

  if (error) return { success: false, error: error.message };
  logAudit(
    'linkedin_rule_updated',
    'linkedin_mapping_rule',
    parsed.data.id,
    undefined,
    user.id,
  );
  revalidatePath('/commercial/linkedin');
  return { success: true };
}

export async function deleteMappingRule(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  if (!z.string().uuid().safeParse(id).success) {
    return { success: false, error: 'Règle invalide' };
  }
  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('linkedin_mapping_rules')
    .delete()
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  logAudit(
    'linkedin_rule_deleted',
    'linkedin_mapping_rule',
    id,
    undefined,
    user.id,
  );
  revalidatePath('/commercial/linkedin');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Lecture pour l'encart fiche (consommée par un composant client)
// ---------------------------------------------------------------------------

/**
 * Dernier évènement LinkedIn d'un prospect, pour l'encart d'origine de la fiche.
 * RLS appliquée via le client serveur de l'appelant (pipeline + admin).
 */
export async function getLastLinkedinEvent(
  prospectId: string,
): Promise<LinkedinEventRecord | null> {
  if (!z.string().uuid().safeParse(prospectId).success) return null;
  const auth = await requireAuth();
  if (!auth.ok) return null;
  return getLastLinkedinEventForProspect(prospectId);
}
