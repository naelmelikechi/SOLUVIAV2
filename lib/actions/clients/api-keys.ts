'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { checkAuth } from '@/lib/auth/guards';
import { encryptApiKey, decryptApiKey } from '@/lib/utils/encryption';
import {
  baseUrlFrom,
  EDUVIA_INSTANCE_URL_REGEX,
  normalizeEduviaInstanceUrl,
} from '@/lib/eduvia/client';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import { uuidSchema, clientIdSchema } from './shared';

const AddClientApiKeySchema = z.object({
  clientId: clientIdSchema,
  data: z.object({
    // instance_url stocke en hostname canonique (ex: "dupont.eduvia.app").
    // L user peut coller une URL complete (https://api.dupont.eduvia.app/api/v1),
    // on normalise puis valide. baseUrlFrom() (lib/eduvia/client.ts) prefixe
    // ensuite `https://api.` lui-meme, d ou la forme canonique en DB.
    instanceUrl: z
      .string()
      .trim()
      .min(1, "L'URL de l'instance est requise")
      .max(500)
      .transform(normalizeEduviaInstanceUrl)
      .refine(
        (v) => EDUVIA_INSTANCE_URL_REGEX.test(v),
        'Format attendu : slug.eduvia.app (ex: dupont.eduvia.app)',
      ),
    // API key Eduvia : chiffree en aval, pas de validation format stricte.
    apiKey: z.string().trim().min(1, 'La cle API est requise').max(500),
    label: z.string().trim().min(1, 'Le libellé est requis').max(200),
  }),
});

const DeleteClientApiKeySchema = z.object({ keyId: uuidSchema });

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

  const auth = await checkAuth();
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

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // Get client_id before deleting for revalidation
  const { data: keyRow } = await supabase
    .from('client_api_keys')
    .select('client_id')
    .eq('id', parsed.data.keyId)
    .single();

  // oxlint-disable-next-line react-doctor/server-sequential-independent-await
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
  const auth = await checkAuth();
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
  const auth = await checkAuth();
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
