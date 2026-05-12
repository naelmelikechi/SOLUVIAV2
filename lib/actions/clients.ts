'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin, requireUser } from '@/lib/auth/guards';
import { encryptApiKey, decryptApiKey } from '@/lib/utils/encryption';
import { baseUrlFrom } from '@/lib/eduvia/client';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import {
  isValidSiretFormat,
  isValidSiretLuhn,
  normalizeSiret,
} from '@/lib/utils/siret';

const SOLUVIA_INTERNAL_CLIENT_ID = '00000000-0000-0000-0000-0000000000ff';

// ---------------------------------------------------------------------------
// Schemas Zod (validation cote serveur, defense en profondeur)
// ---------------------------------------------------------------------------
// Pourquoi : RLS bloque les acces non autorises mais ne contraint pas le
// type. Sans ces guards, un client peut poster des donnees aberrantes
// (raison sociale = NaN, email = garbage, URL hostile) et corrompre la base.

const uuidSchema = z.string().uuid('ID doit être un UUID');
const clientIdSchema = z.string().uuid('clientId doit être un UUID');
const optionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

const ClientDataSchema = z.object({
  raison_sociale: z
    .string()
    .trim()
    .min(1, 'La raison sociale est requise')
    .max(2000),
  // SIRET : format strict valide en aval via checkSiretServer (Luhn + format).
  // Ici on accepte la chaine brute (avec espaces) qui sera normalisee plus tard.
  siret: z.string().trim().max(50).optional().nullable(),
  adresse: optionalTrimmedString(2000),
  localisation: optionalTrimmedString(500),
  tva_intracommunautaire: optionalTrimmedString(50),
  numero_qualiopi: optionalTrimmedString(100),
  numero_nda: optionalTrimmedString(100),
  numero_uai: optionalTrimmedString(100),
  is_demo: z.boolean().optional(),
});

const CreateClientSchema = ClientDataSchema;
const UpdateClientSchema = z.object({
  id: uuidSchema,
  data: ClientDataSchema,
});

const UpdateClientApporteurSchema = z.object({
  clientId: clientIdSchema,
  apporteurId: z.string().uuid('apporteurId doit être un UUID').nullable(),
  apporteurDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format YYYY-MM-DD requise')
    .nullable(),
});

const ArchiveClientSchema = z.object({ id: uuidSchema });

const ContactDataSchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est requis').max(2000),
  poste: optionalTrimmedString(500),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Email invalide')
    .max(254)
    .nullable()
    .optional(),
  telephone: z.string().trim().min(5).max(30).nullable().optional(),
});

const AddClientContactSchema = z.object({
  clientId: clientIdSchema,
  data: ContactDataSchema,
});

const DeleteClientContactSchema = z.object({
  contactId: uuidSchema,
  clientId: clientIdSchema,
});

const AddClientNoteSchema = z.object({
  clientId: clientIdSchema,
  contenu: z.string().trim().min(1, 'Le contenu est requis').max(2000),
});

const AddClientApiKeySchema = z.object({
  clientId: clientIdSchema,
  data: z.object({
    // instance_url stocke en hostname (ex: "dupont.eduvia.app"),
    // pas en URL complete - voir baseUrlFrom() dans lib/eduvia/client.ts.
    instanceUrl: z
      .string()
      .trim()
      .min(1, "L'URL de l'instance est requise")
      .max(500)
      .refine(
        (v) => v.includes('.eduvia.app'),
        "L'URL doit contenir .eduvia.app (ex: dupont.eduvia.app)",
      ),
    // API key Eduvia : chiffree en aval, pas de validation format stricte.
    apiKey: z.string().trim().min(1, 'La cle API est requise').max(500),
    label: z.string().trim().min(1, 'Le libellé est requis').max(200),
  }),
});

const DeleteClientApiKeySchema = z.object({ keyId: uuidSchema });

interface SiretCheckResult {
  ok: boolean;
  error?: string;
  cleaned: string;
}

function checkSiretServer(
  rawSiret: string | null | undefined,
  options: { isDemo: boolean; isInternal: boolean; clientId?: string },
): SiretCheckResult {
  const cleaned = normalizeSiret(rawSiret);

  // Exception client interne SOLUVIA
  if (options.isInternal) {
    if (!cleaned) return { ok: true, cleaned };
    if (!isValidSiretFormat(cleaned)) {
      return {
        ok: false,
        cleaned,
        error: 'SIRET de 14 chiffres requis pour un client externe.',
      };
    }
    if (!isValidSiretLuhn(cleaned)) {
      logger.warn('actions.clients', 'SIRET Luhn invalide (non bloquant)', {
        clientId: options.clientId,
        siret: cleaned,
      });
    }
    return { ok: true, cleaned };
  }

  // Client demo : SIRET optionnel
  if (options.isDemo && !cleaned) {
    return { ok: true, cleaned };
  }

  if (!cleaned || !isValidSiretFormat(cleaned)) {
    return {
      ok: false,
      cleaned,
      error: 'SIRET de 14 chiffres requis pour un client externe.',
    };
  }

  if (!isValidSiretLuhn(cleaned)) {
    logger.warn('actions.clients', 'SIRET Luhn invalide (non bloquant)', {
      clientId: options.clientId,
      siret: cleaned,
    });
  }

  return { ok: true, cleaned };
}

// ---------------------------------------------------------------------------
// createClient - insert a new client
// ---------------------------------------------------------------------------

interface ClientData {
  raison_sociale: string;
  siret?: string | null;
  adresse?: string | null;
  localisation?: string | null;
  tva_intracommunautaire?: string | null;
  numero_qualiopi?: string | null;
  numero_nda?: string | null;
  numero_uai?: string | null;
  is_demo?: boolean;
}

export async function createClientAction(
  data: ClientData,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const parsed = CreateClientSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  const validated = parsed.data;

  const siretCheck = checkSiretServer(validated.siret, {
    isDemo: validated.is_demo ?? false,
    isInternal: false,
  });
  if (!siretCheck.ok) {
    return { success: false, error: siretCheck.error };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // trigramme is auto-generated by DB trigger when empty
  const { data: client, error } = await supabase
    .from('clients')
    .insert({
      raison_sociale: validated.raison_sociale,
      trigramme: '',
      siret: siretCheck.cleaned || null,
      adresse: validated.adresse,
      localisation: validated.localisation,
      tva_intracommunautaire: validated.tva_intracommunautaire,
      numero_qualiopi: validated.numero_qualiopi,
      numero_nda: validated.numero_nda,
      numero_uai: validated.numero_uai,
      is_demo: validated.is_demo ?? false,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };

  logAudit('client_created', 'client', client.id, undefined, user.id);

  revalidatePath('/admin/clients');

  return { success: true, id: client.id };
}

// ---------------------------------------------------------------------------
// updateClient - update an existing client
// ---------------------------------------------------------------------------

export async function updateClientAction(
  id: string,
  data: ClientData,
): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateClientSchema.safeParse({ id, data });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  const { id: validatedId, data: validated } = parsed.data;

  const siretCheck = checkSiretServer(validated.siret, {
    isDemo: validated.is_demo ?? false,
    isInternal: validatedId === SOLUVIA_INTERNAL_CLIENT_ID,
    clientId: validatedId,
  });
  if (!siretCheck.ok) {
    return { success: false, error: siretCheck.error };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('clients')
    .update({
      raison_sociale: validated.raison_sociale,
      siret: siretCheck.cleaned || null,
      adresse: validated.adresse,
      localisation: validated.localisation,
      tva_intracommunautaire: validated.tva_intracommunautaire,
      numero_qualiopi: validated.numero_qualiopi,
      numero_nda: validated.numero_nda,
      numero_uai: validated.numero_uai,
      is_demo: validated.is_demo ?? false,
    })
    .eq('id', validatedId);

  if (error) return { success: false, error: error.message };

  logAudit('client_updated', 'client', validatedId, undefined, user.id);

  revalidatePath('/admin/clients');
  revalidatePath(`/admin/clients/${validatedId}`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// updateClientApporteur - update apporteur commercial + date
// ---------------------------------------------------------------------------

export async function updateClientApporteur(
  clientId: string,
  apporteurId: string | null,
  apporteurDate: string | null,
): Promise<{ success: boolean; error?: string }> {
  // Normalisation prealable des chaines vides en null pour rester compatible
  // avec les anciens callers qui envoient '' au lieu de null.
  const normalizedApporteurId =
    apporteurId && apporteurId.trim() ? apporteurId.trim() : null;
  const normalizedApporteurDate =
    apporteurDate && apporteurDate.trim() ? apporteurDate.trim() : null;

  const parsed = UpdateClientApporteurSchema.safeParse({
    clientId,
    apporteurId: normalizedApporteurId,
    apporteurDate: normalizedApporteurDate,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  const validated = parsed.data;

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  let normalizedDate = validated.apporteurDate;

  if (validated.apporteurId) {
    const { data: apporteur, error: lookupError } = await supabase
      .from('users')
      .select('id')
      .eq('id', validated.apporteurId)
      .maybeSingle();

    if (lookupError || !apporteur) {
      return {
        success: false,
        error: "L'apporteur sélectionné est introuvable",
      };
    }

    if (!normalizedDate) {
      normalizedDate = new Date().toISOString().slice(0, 10);
    }
  } else {
    normalizedDate = null;
  }

  const { error } = await supabase
    .from('clients')
    .update({
      apporteur_commercial_id: validated.apporteurId,
      apporteur_date: normalizedDate,
    })
    .eq('id', validated.clientId);

  if (error) return { success: false, error: error.message };

  logAudit(
    'client_apporteur_updated',
    'client',
    validated.clientId,
    {
      apporteurId: validated.apporteurId,
      apporteurDate: normalizedDate,
    },
    user.id,
  );

  revalidatePath('/admin/clients');
  revalidatePath(`/admin/clients/${validated.clientId}`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// archiveClient - soft delete (archive = true)
// ---------------------------------------------------------------------------

export async function archiveClient(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = ArchiveClientSchema.safeParse({ id });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'ID invalide',
    };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('clients')
    .update({ archive: true })
    .eq('id', parsed.data.id);

  if (error) return { success: false, error: error.message };

  logAudit('client_archived', 'client', parsed.data.id, undefined, user.id);

  revalidatePath('/admin/clients');

  return { success: true };
}

// ---------------------------------------------------------------------------
// unarchiveClient - restore (archive = false)
// ---------------------------------------------------------------------------

export async function unarchiveClient(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = ArchiveClientSchema.safeParse({ id });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'ID invalide',
    };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('clients')
    .update({ archive: false })
    .eq('id', parsed.data.id);

  if (error) return { success: false, error: error.message };

  logAudit('client_unarchived', 'client', parsed.data.id, undefined, user.id);

  revalidatePath('/admin/clients');
  revalidatePath(`/admin/clients/${parsed.data.id}`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// addClientContact - insert into client_contacts
// ---------------------------------------------------------------------------

interface ContactData {
  nom: string;
  poste?: string | null;
  email?: string | null;
  telephone?: string | null;
}

export async function addClientContact(
  clientId: string,
  data: ContactData,
): Promise<{ success: boolean; error?: string }> {
  // Normaliser '' en null avant validation pour les champs optionnels
  const normalized = {
    nom: data.nom,
    poste: data.poste?.trim() ? data.poste : null,
    email: data.email?.trim() ? data.email : null,
    telephone: data.telephone?.trim() ? data.telephone : null,
  };

  const parsed = AddClientContactSchema.safeParse({
    clientId,
    data: normalized,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  const validated = parsed.data;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase.from('client_contacts').insert({
    client_id: validated.clientId,
    nom: validated.data.nom,
    poste: validated.data.poste ?? null,
    email: validated.data.email ?? null,
    telephone: validated.data.telephone ?? null,
  });

  if (error) return { success: false, error: error.message };

  logAudit(
    'contact_added',
    'client',
    validated.clientId,
    { nom: validated.data.nom },
    user.id,
  );

  revalidatePath(`/admin/clients/${validated.clientId}`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// deleteClientContact - hard delete from client_contacts
// ---------------------------------------------------------------------------

export async function deleteClientContact(
  contactId: string,
  clientId: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = DeleteClientContactSchema.safeParse({ contactId, clientId });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('client_contacts')
    .delete()
    .eq('id', parsed.data.contactId);

  if (error) return { success: false, error: error.message };

  logAudit(
    'contact_deleted',
    'client',
    parsed.data.contactId,
    undefined,
    user.id,
  );

  revalidatePath(`/admin/clients/${parsed.data.clientId}`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// addClientNote - insert into client_notes
// ---------------------------------------------------------------------------

export async function addClientNote(
  clientId: string,
  contenu: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = AddClientNoteSchema.safeParse({ clientId, contenu });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase.from('client_notes').insert({
    client_id: parsed.data.clientId,
    user_id: user.id,
    contenu: parsed.data.contenu,
  });

  if (error) return { success: false, error: error.message };

  logAudit('note_added', 'client', parsed.data.clientId, undefined, user.id);

  revalidatePath(`/admin/clients/${parsed.data.clientId}`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// addClientApiKey - insert into client_api_keys with encrypted key
// ---------------------------------------------------------------------------

export async function addClientApiKey(
  clientId: string,
  data: {
    instanceUrl: string;
    apiKey: string;
    label: string;
  },
): Promise<{ success: boolean; error?: string }> {
  const parsed = AddClientApiKeySchema.safeParse({ clientId, data });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  const validated = parsed.data;

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  let apiKeyEncrypted: string;
  try {
    apiKeyEncrypted = encryptApiKey(validated.data.apiKey);
  } catch (err) {
    logger.error(
      'actions.clients',
      'ENCRYPTION_KEY manquante: refus de stocker la cle API en clair',
      { error: err instanceof Error ? err.message : String(err) },
    );
    return {
      success: false,
      error:
        'Configuration serveur invalide: le chiffrement des clés API est indisponible. Contactez un administrateur.',
    };
  }

  const { error } = await supabase.from('client_api_keys').insert({
    client_id: validated.clientId,
    instance_url: validated.data.instanceUrl,
    api_key_encrypted: apiKeyEncrypted,
    label: validated.data.label,
    is_active: true,
  });

  if (error) return { success: false, error: error.message };

  logAudit(
    'apikey_added',
    'client',
    validated.clientId,
    { label: validated.data.label },
    user.id,
  );

  revalidatePath(`/admin/clients/${validated.clientId}`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// deleteClientApiKey - hard delete from client_api_keys
// ---------------------------------------------------------------------------

export async function deleteClientApiKey(
  keyId: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = DeleteClientApiKeySchema.safeParse({ keyId });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // Get client_id before deleting for revalidation
  const { data: keyRow } = await supabase
    .from('client_api_keys')
    .select('client_id')
    .eq('id', parsed.data.keyId)
    .single();

  const { error } = await supabase
    .from('client_api_keys')
    .delete()
    .eq('id', parsed.data.keyId);

  if (error) return { success: false, error: error.message };

  logAudit('apikey_deleted', 'client', parsed.data.keyId, undefined, user.id);

  if (keyRow) {
    revalidatePath(`/admin/clients/${keyRow.client_id}`);
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// toggleClientApiKeyActive - toggle is_active on client_api_keys
// ---------------------------------------------------------------------------

export async function toggleClientApiKeyActive(
  keyId: string,
  isActive: boolean,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('client_api_keys')
    .update({ is_active: isActive })
    .eq('id', keyId);

  if (error) return { success: false, error: error.message };

  logAudit('apikey_toggled', 'client', keyId, { isActive }, user.id);

  // Get client_id for revalidation
  const { data: keyRow } = await supabase
    .from('client_api_keys')
    .select('client_id')
    .eq('id', keyId)
    .single();

  if (keyRow) {
    revalidatePath(`/admin/clients/${keyRow.client_id}`);
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// testApiKeyConnection - test connectivity to Eduvia instance
// ---------------------------------------------------------------------------

export async function testApiKeyConnection(
  keyId: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase } = auth;

  const { data: keyRow, error: fetchError } = await supabase
    .from('client_api_keys')
    .select('api_key_encrypted, instance_url')
    .eq('id', keyId)
    .single();

  if (fetchError || !keyRow) {
    return { success: false, error: 'Clé API introuvable' };
  }

  if (!keyRow.instance_url) {
    return { success: false, error: "URL d'instance manquante" };
  }

  let apiKey: string;
  try {
    apiKey = decryptApiKey(keyRow.api_key_encrypted);
  } catch (err) {
    logger.error('actions.clients', 'dechiffrement cle API impossible', {
      error: err instanceof Error ? err.message : String(err),
      keyId,
    });
    return {
      success: false,
      error:
        'Impossible de dechiffrer la cle API. Verifiez la configuration ENCRYPTION_KEY ou recreez la cle.',
    };
  }

  // Use the same URL construction as the sync engine so "test connection"
  // validates the exact endpoint that will actually be hit during sync.
  const url = `${baseUrlFrom(keyRow.instance_url)}/api/v1/status`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Erreur HTTP ${response.status} : ${response.statusText}`,
      };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Connexion échouée : ${message}`,
    };
  }
}
