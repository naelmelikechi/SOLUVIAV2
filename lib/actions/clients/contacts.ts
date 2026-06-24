'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/guards';
import { logAudit } from '@/lib/utils/audit';
import type { Database } from '@/types/database';
import { uuidSchema, clientIdSchema, optionalTrimmedString } from './shared';

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
  recoit_factures: z.boolean().optional(),
  recoit_factures_cc: z.boolean().optional(),
});

const AddClientContactSchema = z.object({
  clientId: clientIdSchema,
  data: ContactDataSchema,
});

const UpdateClientContactSchema = z.object({
  contactId: uuidSchema,
  clientId: clientIdSchema,
  data: ContactDataSchema.partial(),
});

const DeleteClientContactSchema = z.object({
  contactId: uuidSchema,
  clientId: clientIdSchema,
});

const AddClientNoteSchema = z.object({
  clientId: clientIdSchema,
  contenu: z.string().trim().min(1, 'Le contenu est requis').max(2000),
});

interface ContactData {
  nom: string;
  poste?: string | null;
  email?: string | null;
  telephone?: string | null;
  recoit_factures?: boolean;
  recoit_factures_cc?: boolean;
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
    recoit_factures: data.recoit_factures ?? false,
    recoit_factures_cc: data.recoit_factures_cc ?? false,
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

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase.from('client_contacts').insert({
    client_id: validated.clientId,
    nom: validated.data.nom,
    poste: validated.data.poste ?? null,
    email: validated.data.email ?? null,
    telephone: validated.data.telephone ?? null,
    recoit_factures: validated.data.recoit_factures ?? false,
    recoit_factures_cc: validated.data.recoit_factures_cc ?? false,
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
// updateClientContact - patch partiel sur un contact existant
// ---------------------------------------------------------------------------
// Utile pour basculer les flags recoit_factures / recoit_factures_cc depuis la
// fiche client sans re-creer le contact. Validation Zod stricte pour eviter
// d'injecter des champs hors schema.

export async function updateClientContact(
  contactId: string,
  clientId: string,
  data: Partial<ContactData>,
): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateClientContactSchema.safeParse({
    contactId,
    clientId,
    data,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  const validated = parsed.data;

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // Construit le patch en ne touchant que les champs explicitement fournis,
  // pour ne pas ecraser involontairement des valeurs existantes.
  const patch: Database['public']['Tables']['client_contacts']['Update'] = {};
  if ('nom' in validated.data && validated.data.nom !== undefined)
    patch.nom = validated.data.nom;
  if ('poste' in validated.data) patch.poste = validated.data.poste ?? null;
  if ('email' in validated.data) patch.email = validated.data.email ?? null;
  if ('telephone' in validated.data)
    patch.telephone = validated.data.telephone ?? null;
  if ('recoit_factures' in validated.data)
    patch.recoit_factures = validated.data.recoit_factures ?? false;
  if ('recoit_factures_cc' in validated.data)
    patch.recoit_factures_cc = validated.data.recoit_factures_cc ?? false;

  if (Object.keys(patch).length === 0) {
    return { success: true };
  }

  const { error } = await supabase
    .from('client_contacts')
    .update(patch)
    .eq('id', validated.contactId)
    .eq('client_id', validated.clientId);

  if (error) return { success: false, error: error.message };

  logAudit(
    'contact_updated',
    'client',
    validated.contactId,
    patch as Record<string, string | number | boolean | null>,
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

  const auth = await requireAuth();
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

  const auth = await requireAuth();
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
